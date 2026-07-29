/**
 * Post-processing for FAQ semantic search (Nest layer).
 * Keeps SentenceTransformers ranking but adds lexical boost + gated fallback
 * to avoid serving a low-confidence wrong answer as if it were a hit.
 */

/** Minimal shape required for Nest post-ranking (preserves full FAQ DTO via generics). */
export interface FaqRankedHit {
  score: number;
  question?: string | null;
}

/** Default: do not force a top-1 answer below this cosine/boosted score. */
export const DEFAULT_FAQ_FALLBACK_MIN_SCORE = 0.55;

/** Lexical score that counts as near-exact (safe to inject from DB corpus). */
export const FAQ_NEAR_EXACT_LEXICAL_MIN = 0.88;

export function normalizeFaqText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Straight + curly quotes / guillemets
    .replace(/[''`´‘’“”„«»]/g, ' ')
    .replace(/[^a-z0-9àâäéèêëïîôùûüç\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(normalized: string): Set<string> {
  return new Set(
    normalized
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Conservative lexical boost on top of embedding cosine.
 * Near-exact question match must outrank a weak semantic neighbor.
 */
export function lexicalBoostedScore(query: string, question: string, semanticScore: number): number {
  const base = Number.isFinite(semanticScore) ? Math.max(0, Math.min(1, semanticScore)) : 0;
  const q = normalizeFaqText(query);
  const faq = normalizeFaqText(question || '');
  if (!q || !faq) return base;

  if (q === faq) {
    return Math.max(base, 0.95);
  }

  // Containment of a meaningful phrase (e.g. distinctive metric name).
  if (q.length >= 12 && faq.includes(q)) {
    return Math.max(base, 0.92);
  }
  if (faq.length >= 12 && q.includes(faq)) {
    return Math.max(base, 0.9);
  }

  const jac = jaccard(tokenSet(q), tokenSet(faq));
  if (jac >= 0.75) {
    return Math.max(base, 0.88);
  }
  if (jac >= 0.55) {
    return Math.max(base, Math.min(1, base + 0.2));
  }
  if (jac >= 0.4) {
    return Math.max(base, Math.min(1, base + 0.1));
  }

  return base;
}

export function applyLexicalBoostToResults<T extends FaqRankedHit>(
  results: T[],
  query: string,
): T[] {
  return results
    .map((item) => {
      const next: T = {
        ...item,
        score: lexicalBoostedScore(query, String(item.question ?? ''), Number(item.score) || 0),
      };
      return next;
    })
    .sort((a, b) => b.score - a.score);
}

export interface FaqCorpusEntry {
  id: string;
  question: string;
  answer: string;
  category?: string | null;
  priority?: string | null;
}

/** Concrete hit shape used when merging DB corpus into semantic results. */
export interface FaqSearchHit extends FaqRankedHit {
  id: string;
  question: string;
  answer: string;
  category?: string;
  priority?: string;
}

/**
 * Inject near-exact FAQ rows from the live DB corpus when they are missing from
 * the embedding top-K (stale index / rebuild race). Does not revive weak neighbors.
 */
export function mergeNearExactCorpusHits(
  semanticResults: FaqSearchHit[],
  corpus: FaqCorpusEntry[],
  query: string,
  nearExactMin = FAQ_NEAR_EXACT_LEXICAL_MIN,
): FaqSearchHit[] {
  const byId = new Map<string, FaqSearchHit>();
  for (const hit of semanticResults) {
    byId.set(hit.id, { ...hit });
  }

  for (const entry of corpus) {
    if (!entry?.id || !entry.question) continue;
    const existing = byId.get(entry.id);
    const base = existing ? Number(existing.score) || 0 : 0;
    const score = lexicalBoostedScore(query, entry.question, base);
    if (score < nearExactMin) continue;

    if (existing) {
      byId.set(entry.id, { ...existing, score });
      continue;
    }

    byId.set(entry.id, {
      id: entry.id,
      question: entry.question,
      answer: entry.answer,
      category: entry.category ?? 'general',
      priority: entry.priority ?? 'medium',
      score,
    });
  }

  return [...byId.values()].sort((a, b) => b.score - a.score);
}

export interface AdaptiveFaqStrategyResult<T extends FaqRankedHit> {
  results: T[];
  strategyStep: string;
  total: number;
}

/**
 * Adaptive thresholds, then optional gated fallback_top1.
 * Empty results when nothing is confident enough (prod-safe).
 */
export function applyAdaptiveFaqStrategy<T extends FaqRankedHit>(input: {
  results: T[];
  thresholds: number[];
  topK: number;
  fallbackMinScore?: number;
  allowFallbackTop1?: boolean;
}): AdaptiveFaqStrategyResult<T> {
  const topK = Math.max(1, input.topK);
  const thresholds = input.thresholds.length > 0 ? input.thresholds : [0.7, 0.65, 0.6];
  const allowFallback = input.allowFallbackTop1 !== false;
  const fallbackMin =
    input.fallbackMinScore ?? DEFAULT_FAQ_FALLBACK_MIN_SCORE;

  for (const threshold of thresholds) {
    const filtered = input.results.filter((item) => item.score >= threshold).slice(0, topK);
    if (filtered.length > 0) {
      return {
        results: filtered,
        strategyStep: `threshold_${threshold}`,
        total: filtered.length,
      };
    }
  }

  const top = input.results[0];
  if (allowFallback && top && top.score >= fallbackMin) {
    return {
      results: [top],
      strategyStep: 'fallback_top1',
      total: 1,
    };
  }

  return {
    results: [],
    strategyStep: 'no_confident_match',
    total: 0,
  };
}

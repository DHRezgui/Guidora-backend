import {
  applyAdaptiveFaqStrategy,
  applyLexicalBoostToResults,
  lexicalBoostedScore,
  mergeNearExactCorpusHits,
  normalizeFaqText,
  DEFAULT_FAQ_FALLBACK_MIN_SCORE,
} from './faq-search-ranking';

describe('faq-search-ranking', () => {
  it('normalizes accents and punctuation', () => {
    expect(normalizeFaqText("Que signifie 'Total Book of Business' ?")).toBe(
      'que signifie total book of business',
    );
  });

  it('boosts near-exact question above a weak semantic neighbor', () => {
    const query = "Que signifie 'Total Book of Business' ?";
    const exact = lexicalBoostedScore(query, "Que signifie 'Total Book of Business' ?", 0.28);
    const neighbor = lexicalBoostedScore(
      query,
      'Que représente le tableau de bord Portfolio Pulse ?',
      0.32,
    );
    expect(exact).toBeGreaterThanOrEqual(0.9);
    expect(exact).toBeGreaterThan(neighbor);
  });

  it('injects near-exact DB FAQ missing from embedding top-K', () => {
    const merged = mergeNearExactCorpusHits(
      [
        {
          id: 'pulse',
          question: 'Que représente le tableau de bord Portfolio Pulse ?',
          answer: 'Vue.',
          category: 'portfolio',
          priority: 'medium',
          score: 0.32,
        },
      ],
      [
        {
          id: 'tbo',
          question: 'Que signifie "Total Book of Business" ?',
          answer: 'Valeur totale.',
          category: 'metrics',
          priority: 'medium',
        },
      ],
      'Que signifie "Total Book of Business" ?',
    );
    expect(merged[0].id).toBe('tbo');
    expect(merged[0].score).toBeGreaterThanOrEqual(0.9);
  });

  it('does not inject unrelated corpus FAQs', () => {
    const merged = mergeNearExactCorpusHits(
      [{ id: 'pulse', question: 'Portfolio Pulse ?', score: 0.32 }],
      [
        {
          id: 'other',
          question: 'Comment exporter un rapport ?',
          answer: '...',
        },
      ],
      'question sans rapport',
    );
    expect(merged.map((r) => r.id)).toEqual(['pulse']);
  });

  it('reorders results so exact FAQ wins after lexical boost', () => {
    const ranked = applyLexicalBoostToResults(
      [
        {
          id: '1',
          question: 'Que représente le tableau de bord Portfolio Pulse ?',
          score: 0.32,
        },
        {
          id: '2',
          question: "Que signifie 'Total Book of Business' ?",
          score: 0.28,
        },
      ],
      "Que signifie 'Total Book of Business' ?",
    );
    expect(ranked[0].id).toBe('2');
    expect(ranked[0].score).toBeGreaterThanOrEqual(0.9);
  });

  it('keeps strong semantic hits without requiring lexical equality', () => {
    const score = lexicalBoostedScore(
      'mot de passe oublie',
      'Comment reinitialiser mon mot de passe ?',
      0.91,
    );
    expect(score).toBeGreaterThanOrEqual(0.91);
  });

  it('gates fallback_top1 below min score (no forced wrong answer)', () => {
    const gated = applyAdaptiveFaqStrategy({
      results: [{ id: 'wrong', question: 'Autre FAQ', score: 0.32 }],
      thresholds: [0.7, 0.65, 0.6],
      topK: 5,
      fallbackMinScore: DEFAULT_FAQ_FALLBACK_MIN_SCORE,
    });
    expect(gated.strategyStep).toBe('no_confident_match');
    expect(gated.results).toEqual([]);
  });

  it('allows fallback_top1 when score is still reasonably high', () => {
    const ok = applyAdaptiveFaqStrategy({
      results: [{ id: 'ok', question: 'FAQ proche', score: 0.58 }],
      thresholds: [0.7, 0.65, 0.6],
      topK: 5,
      fallbackMinScore: 0.55,
    });
    expect(ok.strategyStep).toBe('fallback_top1');
    expect(ok.results[0].id).toBe('ok');
  });

  it('returns threshold match when score clears adaptive gate', () => {
    const hit = applyAdaptiveFaqStrategy({
      results: [{ id: 'hit', question: 'FAQ', score: 0.72 }],
      thresholds: [0.7, 0.65, 0.6],
      topK: 5,
    });
    expect(hit.strategyStep).toBe('threshold_0.7');
    expect(hit.total).toBe(1);
  });
});

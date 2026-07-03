export interface FaqSuggestionCandidate {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  tags: string[];
  viewCount: number;
  helpfulCount: number;
}

const STOP_WORDS = new Set([
  'avec',
  'comment',
  'dans',
  'des',
  'est',
  'les',
  'pour',
  'que',
  'sur',
  'the',
  'une',
  'and',
  'are',
  'for',
  'from',
  'how',
  'the',
  'this',
  'what',
  'with',
  'your',
]);

function normalizeFaqText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokenizeText(value: string, options?: { dropStopWords?: boolean }): string[] {
  return [
    ...new Set(
      normalizeFaqText(value)
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && (!options?.dropStopWords || !STOP_WORDS.has(token))),
    ),
  ];
}

function tokenizeContext(value: string): string[] {
  return tokenizeText(value, { dropStopWords: true });
}

function extractPriorityFromTags(tags: string[]): number {
  const priorityTag = tags.find((tag) => tag.startsWith('priority:'));
  if (!priorityTag) return 1;
  const value = priorityTag.slice('priority:'.length).trim().toLowerCase();
  if (value === 'high') return 3;
  if (value === 'low') return 0;
  return 1;
}

function popularityScore(item: FaqSuggestionCandidate): number {
  return item.helpfulCount * 2 + item.viewCount;
}

function contextMatchScore(item: FaqSuggestionCandidate, tokens: string[]): number {
  if (tokens.length === 0) return 0;

  const haystackWords = new Set(
    tokenizeText(
      [item.question, item.answer, item.category ?? '', ...item.tags].join(' '),
    ),
  );

  let score = 0;
  for (const token of tokens) {
    if (haystackWords.has(token)) {
      score += token.length >= 6 ? 3 : 2;
    }
  }
  return score;
}

export function rankFaqSuggestions(
  items: FaqSuggestionCandidate[],
  context: string | undefined,
  limit: number,
): FaqSuggestionCandidate[] {
  const safeLimit = Math.max(1, Math.min(limit, 10));
  if (!items.length) return [];

  const tokens = tokenizeContext(context?.trim() ?? '');
  const ranked = [...items]
    .map((item) => ({
      item,
      matchScore: contextMatchScore(item, tokens),
      priorityScore: extractPriorityFromTags(item.tags),
      popularity: popularityScore(item),
    }))
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore;
      if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
      if (right.popularity !== left.popularity) return right.popularity - left.popularity;
      return left.item.question.localeCompare(right.item.question, 'fr');
    });

  const matched = ranked.filter((entry) => entry.matchScore > 0);
  if (matched.length === 0) {
    return ranked.slice(0, safeLimit).map((entry) => entry.item);
  }

  const selected: FaqSuggestionCandidate[] = [];
  const seenIds = new Set<string>();

  const append = (entry: (typeof ranked)[number]) => {
    if (selected.length >= safeLimit || seenIds.has(entry.item.id)) return;
    seenIds.add(entry.item.id);
    selected.push(entry.item);
  };

  for (const entry of matched) append(entry);
  for (const entry of ranked) append(entry);

  return selected;
}

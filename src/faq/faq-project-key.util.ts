/** Default pack when no project is specified (org-wide legacy entries). */
export const DEFAULT_FAQ_PROJECT_KEY = 'default';

const MAX_PROJECT_KEY_LENGTH = 120;

/** Normalizes dashboard/SDK `projectKey` / `flowVersion` values for FAQ scoping. */
export function normalizeFaqProjectKey(raw?: string | null): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return DEFAULT_FAQ_PROJECT_KEY;
  return trimmed.slice(0, MAX_PROJECT_KEY_LENGTH);
}

/** Safe directory segment for embeddings storage (`test-11-v1` unchanged). */
export function faqProjectStorageSegment(projectKey: string): string {
  const normalized = normalizeFaqProjectKey(projectKey);
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

import { DEFAULT_FAQ_PROJECT_KEY, normalizeFaqProjectKey } from '../faq/faq-project-key.util';

describe('published blueprint SDK project scoping', () => {
  it('normalizes absent projectKey to default (strict, not org-wide)', () => {
    expect(normalizeFaqProjectKey(undefined)).toBe(DEFAULT_FAQ_PROJECT_KEY);
    expect(normalizeFaqProjectKey('')).toBe(DEFAULT_FAQ_PROJECT_KEY);
  });

  it('keeps SDK project keys exact', () => {
    expect(normalizeFaqProjectKey('test-13-v1')).toBe('test-13-v1');
    expect(normalizeFaqProjectKey('default')).toBe('default');
  });
});

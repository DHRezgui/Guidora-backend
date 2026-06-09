import { normalizeRequestedScopes } from './sdk-token-scopes';

describe('normalizeRequestedScopes', () => {
  it('returns defaults when scopes omitted for developer', () => {
    const scopes = normalizeRequestedScopes(undefined, 'DEVELOPER');
    expect(scopes).toContain('blueprints:read');
    expect(scopes).not.toContain('tours:publish');
  });

  it('strips admin-only scopes for developer', () => {
    const scopes = normalizeRequestedScopes(
      ['blueprints:read', 'tours:publish', 'blueprints:manage'],
      'DEVELOPER',
    );
    expect(scopes).toEqual(['blueprints:read']);
  });

  it('allows admin-only scopes for admin', () => {
    const scopes = normalizeRequestedScopes(['tours:publish', 'blueprints:read'], 'ADMIN');
    expect(scopes).toContain('tours:publish');
  });
});

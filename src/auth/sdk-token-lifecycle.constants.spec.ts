import {
  BROWSER_SDK_SESSION_SCOPES,
  DEFAULT_SDK_TOKEN_TTL_DAYS,
  intersectPatScopesWithBrowserSession,
  resolveSdkTokenExpiresAt,
} from './sdk-token-lifecycle.constants';

describe('sdk-token-lifecycle.constants', () => {
  it('defaults PAT expiry to 90 days', () => {
    const expiresAt = resolveSdkTokenExpiresAt(DEFAULT_SDK_TOKEN_TTL_DAYS);
    const deltaDays = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(deltaDays).toBeGreaterThan(89);
    expect(deltaDays).toBeLessThanOrEqual(90.1);
  });

  it('clamps PAT expiry to configured bounds', () => {
    const short = resolveSdkTokenExpiresAt(1);
    const long = resolveSdkTokenExpiresAt(999);
    expect(short.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    expect(long.getTime()).toBeLessThan(Date.now() + 366 * 24 * 60 * 60 * 1000);
  });

  it('intersects PAT scopes with browser-safe session scopes', () => {
    const scopes = intersectPatScopesWithBrowserSession([
      'tours:runtime',
      'tours:publish',
      'feedback:write',
    ]);
    expect(scopes).toEqual(['tours:runtime', 'feedback:write']);
    expect(BROWSER_SDK_SESSION_SCOPES).not.toContain('tours:publish');
  });
});

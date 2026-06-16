import type { SdkTokenScope } from './sdk-token-scopes';

/** Durée par défaut des PAT d'intégration (jours). */
export const DEFAULT_SDK_TOKEN_TTL_DAYS = 90;

/** Durée maximale sélectionnable à la création (jours). */
export const MAX_SDK_TOKEN_TTL_DAYS = 365;

/** Durée minimale sélectionnable à la création (jours). */
export const MIN_SDK_TOKEN_TTL_DAYS = 7;

/** Durée des sessions navigateur échangées depuis un PAT (secondes). */
export const DEFAULT_SDK_SESSION_TTL_SECONDS = 900;

/** Préfixe des tokens de session BFF (courte durée, exposables au browser). */
export const SDK_SESSION_TOKEN_PREFIX = 'td_sess_';

/**
 * Scopes autorisés dans une session navigateur (exclut tours:publish).
 * L'échange PAT → session intersecte toujours avec cette liste.
 */
export const BROWSER_SDK_SESSION_SCOPES: readonly SdkTokenScope[] = [
  'tours:runtime',
  'tours:sandbox',
  'blueprints:read',
  'feedback:read',
  'feedback:write',
  'semantic:invoke',
] as const;

export function resolveSdkTokenExpiresAt(expiresInDays: number): Date {
  const safeDays = Math.min(
    MAX_SDK_TOKEN_TTL_DAYS,
    Math.max(MIN_SDK_TOKEN_TTL_DAYS, Math.round(expiresInDays)),
  );
  return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);
}

export function intersectPatScopesWithBrowserSession(
  patScopes: SdkTokenScope[],
): SdkTokenScope[] {
  const allowed = new Set(BROWSER_SDK_SESSION_SCOPES);
  return patScopes.filter((scope) => allowed.has(scope));
}

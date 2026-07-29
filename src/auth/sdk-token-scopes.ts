/** Scopes assignable to SDK integration tokens (PAT). */
export const SDK_TOKEN_SCOPES = [
  'tours:runtime',
  'tours:sandbox',
  'blueprints:read',
  'feedback:read',
  'feedback:write',
  'semantic:invoke',
  'faq:search',
  'ml:predict',
  'support:write',
  'tours:publish',
] as const;

export type SdkTokenScope = (typeof SDK_TOKEN_SCOPES)[number];

/** Default scopes for DEVELOPER-created integration tokens (read + feedback + runtime). */
export const DEFAULT_DEVELOPER_SDK_SCOPES: SdkTokenScope[] = [
  'tours:runtime',
  'tours:sandbox',
  'blueprints:read',
  'feedback:read',
  'feedback:write',
  'semantic:invoke',
  'faq:search',
  'ml:predict',
  'support:write',
];

/** Extra scopes only assignable when creator is ADMIN (none today — reserved for future). */
export const ADMIN_ONLY_SDK_SCOPES: SdkTokenScope[] = [];

export const SDK_TOKEN_PREFIX = 'td_sdk_';

export function isSdkTokenScope(value: string): value is SdkTokenScope {
  return (SDK_TOKEN_SCOPES as readonly string[]).includes(value);
}

export function normalizeRequestedScopes(
  requested: string[] | undefined,
  creatorRole: string,
): SdkTokenScope[] {
  const raw = requested?.length ? requested : DEFAULT_DEVELOPER_SDK_SCOPES;
  const unique = [...new Set(raw.filter(isSdkTokenScope))];
  if (unique.length === 0) {
    return [...DEFAULT_DEVELOPER_SDK_SCOPES];
  }
  if (creatorRole === 'ADMIN') {
    return unique;
  }
  return unique.filter((scope) => !ADMIN_ONLY_SDK_SCOPES.includes(scope));
}

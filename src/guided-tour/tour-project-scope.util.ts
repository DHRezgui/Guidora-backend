import { DEFAULT_FAQ_PROJECT_KEY, normalizeFaqProjectKey } from '../faq/faq-project-key.util';
import { isSdkLabProjectKey, SDK_LAB_TARGET_PATH_SEGMENT } from './guided-tour-lab.util';

/** SQL expression for contextualEngine.flowVersion on guided_tour.trigger_conditions. */
export const TOUR_FLOW_VERSION_SQL_EXPR =
  "tour.trigger_conditions->'contextualEngine'->>'flowVersion'";

export function tourFlowVersionSqlExpr(tourAlias = 'tour'): string {
  return `${tourAlias}.trigger_conditions->'contextualEngine'->>'flowVersion'`;
}

/** Generic FAQ project = tours without SDK flowVersion (not literal key "default"). */
export function isGenericProjectTourScope(projectKey?: string | null): boolean {
  return normalizeFaqProjectKey(projectKey) === DEFAULT_FAQ_PROJECT_KEY;
}

export function isSdkScopedProjectKey(projectKey?: string | null): boolean {
  const normalized = normalizeFaqProjectKey(projectKey);
  return normalized !== DEFAULT_FAQ_PROJECT_KEY;
}

/**
 * Apply project / flowVersion filter on a tour query builder.
 * - SDK project key → exact flowVersion match
 * - `default` → tours with missing/empty flowVersion (org-wide manual corpus)
 */
export function applyTourProjectScopeFilter(
  andWhere: (sql: string, params?: Record<string, unknown>) => void,
  projectKeyOrFlowVersion?: string,
  tourAlias = 'tour',
): void {
  const normalized = projectKeyOrFlowVersion?.trim();
  if (!normalized) {
    return;
  }

  const flowVersionExpr = tourFlowVersionSqlExpr(tourAlias);
  const labPath = `%${SDK_LAB_TARGET_PATH_SEGMENT}%`;

  if (isGenericProjectTourScope(normalized)) {
    andWhere(
      `(${flowVersionExpr} IS NULL OR ${flowVersionExpr} = '') AND LOWER(${tourAlias}.target_url) NOT LIKE :sdkLabPath`,
      { sdkLabPath: labPath },
    );
    return;
  }

  andWhere(`${flowVersionExpr} = :flowVersion`, { flowVersion: normalizeFaqProjectKey(normalized) });
}

export function readTourProjectKeyFromEntity(tour: {
  triggerConditions?: Record<string, unknown> | null;
}): string {
  const engine = tour.triggerConditions?.contextualEngine;
  if (!engine || typeof engine !== 'object') {
    return DEFAULT_FAQ_PROJECT_KEY;
  }
  const flowVersion = (engine as { flowVersion?: unknown }).flowVersion;
  const trimmed = typeof flowVersion === 'string' ? flowVersion.trim() : '';
  if (!trimmed || isSdkLabProjectKey(trimmed)) {
    return DEFAULT_FAQ_PROJECT_KEY;
  }
  return normalizeFaqProjectKey(trimmed);
}

export function isSdkLabTargetTourUrl(targetUrl?: string | null): boolean {
  const normalized = targetUrl?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return false;
  }
  return normalized.includes(SDK_LAB_TARGET_PATH_SEGMENT.toLowerCase());
}

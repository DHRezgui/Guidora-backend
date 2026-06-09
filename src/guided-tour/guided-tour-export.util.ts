import type { GuidedTour } from './entities/guided-tour.entity';
import type { Step } from '../step/entities/step.entity';

export const TOUR_EXPORT_FORMAT_VERSION = 2;

/** Champs autorisés par étape dans un export (import / duplication ultérieure). */
const EXPORT_STEP_KEYS = [
  'title',
  'content',
  'stepType',
  'targetSelector',
  'stepTargetUrl',
  'position',
  'action',
  'skipAllowed',
  'highlightElement',
] as const satisfies ReadonlyArray<keyof Step>;

/** Métadonnées moteur / scoring / debug — jamais exportées. */
const ENGINE_INTERNAL_KEYS = new Set([
  'diagnostics',
  'flowVersion',
  'flowSignature',
  'explainability',
  'signalScores',
  'generatedFrom',
  'conflictNotes',
  'publishedByRole',
  'score',
  'confidence',
  'metadata',
  'persistedAt',
  'activationPolicy',
  'version',
  'concatSourceTourIds',
  'concatSourceTourNames',
  'concatSourceCount',
  'blueprintId',
  'generationMetrics',
  'conflicts',
  'rejectedNoise',
  'migrationNotes',
  'knownFlowSignatures',
]);

/** Clés sensibles ou infrastructure — supprimées à toute profondeur dans triggerConditions. */
const SENSITIVE_NESTED_KEYS = new Set([
  ...ENGINE_INTERNAL_KEYS,
  'accessGrants',
  'assignedAdminIds',
  'createdBy',
  'organizationId',
  'sandboxTestStartedBy',
  'apiKey',
  'api_key',
  'token',
  'secret',
  'password',
  'authorization',
]);

const TRIGGER_TOP_LEVEL_ALLOW = new Set([
  'minTimeOnPage',
  'maxTimeOnPage',
  'requiredElements',
  'userSegment',
]);

/** Sous-ensemble minimal de contextualEngine utile à la réimportation (sans scoring ni versioning). */
const CONTEXTUAL_ENGINE_ALLOW = new Set(['intent', 'scenario', 'status']);

export type TourExportPayload = {
  exportVersion: number;
  exportedAt: string;
  name: string;
  description?: string;
  targetUrl: string;
  priority: number;
  replayPolicy: GuidedTour['replayPolicy'];
  replayAfterDays: number;
  triggerConditions: Record<string, unknown>;
  simulationContext?: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
};

function sanitizeRouteForExport(url?: string | null): string {
  if (!url || typeof url !== 'string') {
    return '/';
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return '/';
  }
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      return parsed.pathname || '/';
    }
  } catch {
    // relative URL
  }
  const withoutHash = trimmed.split('#')[0];
  return withoutHash.split('?')[0] || '/';
}

function pickStepForExport(step: Step): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const key of EXPORT_STEP_KEYS) {
    const value = step[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (key === 'stepTargetUrl' && typeof value === 'string') {
      row[key] = sanitizeRouteForExport(value);
      continue;
    }
    row[key] = value;
  }
  return row;
}

function sanitizeContextualEngine(
  raw: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const engine: Record<string, unknown> = {};
  for (const key of CONTEXTUAL_ENGINE_ALLOW) {
    const value = raw[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (key === 'status' && value !== 'pending_review' && value !== 'active') {
      continue;
    }
    if ((key === 'intent' || key === 'scenario') && typeof value !== 'string') {
      continue;
    }
    engine[key] = value;
  }
  return Object.keys(engine).length > 0 ? engine : undefined;
}

function sanitizeTriggerConditions(
  raw?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const key of TRIGGER_TOP_LEVEL_ALLOW) {
    if (!(key in raw)) {
      continue;
    }
    const value = raw[key];
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }

  const contextual = raw.contextualEngine;
  if (contextual && typeof contextual === 'object' && !Array.isArray(contextual)) {
    const engine = sanitizeContextualEngine(contextual as Record<string, unknown>);
    if (engine) {
      result.contextualEngine = engine;
    }
  }

  return stripSensitiveKeysFromRecord(result);
}

/** Retire toute clé interne restante (défense en profondeur). */
function stripSensitiveKeysFromRecord(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_NESTED_KEYS.has(key) || ENGINE_INTERNAL_KEYS.has(key)) {
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = stripSensitiveKeysFromRecord(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) {
        out[key] = nested;
      }
      continue;
    }
    out[key] = value;
  }
  return out;
}

function sanitizeSimulationElement(
  item: unknown,
): Record<string, unknown> | undefined {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return undefined;
  }
  const el = item as Record<string, unknown>;
  if (typeof el.selector !== 'string' || !el.selector.trim()) {
    return undefined;
  }
  const row: Record<string, unknown> = {
    selector: el.selector,
    tag: typeof el.tag === 'string' ? el.tag : 'unknown',
    actionable: el.actionable === true,
  };
  if (typeof el.role === 'string' && el.role.trim()) {
    row.role = el.role;
  }
  if (
    el.intent === 'discovery' ||
    el.intent === 'primary-action' ||
    el.intent === 'support-navigation' ||
    el.intent === 'form-flow'
  ) {
    row.intent = el.intent;
  }
  if (el.bbox && typeof el.bbox === 'object' && !Array.isArray(el.bbox)) {
    const bbox = el.bbox as Record<string, unknown>;
    const top = Number(bbox.top);
    const left = Number(bbox.left);
    const width = Number(bbox.width);
    const height = Number(bbox.height);
    if (Number.isFinite(top) && Number.isFinite(left) && Number.isFinite(width) && Number.isFinite(height)) {
      row.bbox = { top, left, width, height };
    }
  }
  return row;
}

function redactSimulationContext(
  raw?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }

  const pathname =
    typeof raw.pathname === 'string' ? sanitizeRouteForExport(raw.pathname) : undefined;
  const elements = Array.isArray(raw.elements)
    ? raw.elements
        .map(sanitizeSimulationElement)
        .filter((el): el is Record<string, unknown> => Boolean(el))
    : [];

  if (!pathname && elements.length === 0) {
    return undefined;
  }

  const out: Record<string, unknown> = {};
  if (pathname) {
    out.pathname = pathname;
  }
  if (elements.length > 0) {
    out.elements = elements;
  }
  return out;
}

/** Payload JSON portable : pas de secrets, scoring, diagnostics ni URLs absolues. */
export function buildTourExportPayload(tour: GuidedTour): TourExportPayload {
  const steps = [...(tour.steps ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    exportVersion: TOUR_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    name: tour.name,
    description: tour.description,
    targetUrl: sanitizeRouteForExport(tour.targetUrl),
    priority: tour.priority ?? 0,
    replayPolicy: tour.replayPolicy,
    replayAfterDays: tour.replayAfterDays ?? 0,
    triggerConditions: sanitizeTriggerConditions(
      tour.triggerConditions as Record<string, unknown> | undefined,
    ),
    simulationContext: redactSimulationContext(
      tour.simulationContext as Record<string, unknown> | undefined,
    ),
    steps: steps.map(pickStepForExport),
  };
}

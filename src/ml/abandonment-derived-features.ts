/**
 * Canonical derived-feature formulas for abandonment ML inference.
 * Must stay aligned with: ml/training/derived_features.py
 */

export const ABANDONMENT_FRICTION_WEIGHTS = {
  clickMisses: 0.3,
  hesitations: 0.25,
  timeOnPage: 0.2,
  scrollDepth: 0.25,
} as const;

export const ABANDONMENT_HIGH_FRICTION_THRESHOLD = 0.7;
export const ABANDONMENT_PAGES_SINGLE = 1;
export const ABANDONMENT_PAGES_MULTI = 2;

function clip01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface AbandonmentRawFeatureInput {
  timeOnPage?: number;
  scrollDepth?: number;
  clickMisses?: number;
  hesitations?: number;
  multiplePages?: number;
  idleSeconds?: number;
  /** Current-page dwell; defaults to timeOnPage when absent (legacy clients). */
  pageTime?: number;
}

export function computeAbandonmentDerivedFeatures(
  input: AbandonmentRawFeatureInput,
): Record<string, number> {
  const timeOnPage = Math.max(0, Number(input.timeOnPage ?? 0));
  const pageTime = Math.max(0, Number(input.pageTime ?? timeOnPage));
  const scrollDepth = Math.max(0, Math.min(100, Number(input.scrollDepth ?? 0)));
  const clickMisses = Math.max(0, Number(input.clickMisses ?? 0));
  const hesitations = Math.max(0, Number(input.hesitations ?? 0));
  const pages =
    Number(input.multiplePages ?? 0) === 1 ? ABANDONMENT_PAGES_MULTI : ABANDONMENT_PAGES_SINGLE;

  // pageTime drives per-page dwell; session timeOnPage stays a separate raw feature.
  const timePerPage = pageTime / Math.max(pages, 1);
  const clickMissRate = clickMisses / Math.max(timeOnPage, 1);
  const hesitationRate = hesitations / Math.max(timeOnPage, 1);
  const idleSeconds = Math.max(0, Number(input.idleSeconds ?? 0));
  const idleRatio = idleSeconds / Math.max(pageTime, 1);

  const fw = ABANDONMENT_FRICTION_WEIGHTS;
  const frictionScore = clip01(
    clickMisses * fw.clickMisses +
      hesitations * fw.hesitations +
      Math.min(pageTime / 120, 1) * fw.timeOnPage +
      (1 - scrollDepth / 100) * fw.scrollDepth,
  );

  return {
    pageTime,
    timePerPage,
    clickMissRate,
    hesitationRate,
    idleSeconds,
    idleRatio,
    frictionScore,
    highFriction: frictionScore > ABANDONMENT_HIGH_FRICTION_THRESHOLD ? 1 : 0,
    multipleIssues: clickMisses > 1 && hesitations > 0 ? 1 : 0,
  };
}

export function enrichAbandonmentFeatures(
  features: Record<string, number>,
): Record<string, number> {
  const derived = computeAbandonmentDerivedFeatures({
    timeOnPage: features.timeOnPage,
    scrollDepth: features.scrollDepth,
    clickMisses: features.clickMisses,
    hesitations: features.hesitations,
    multiplePages: features.multiplePages,
    idleSeconds: features.idleSeconds,
    pageTime: features.pageTime,
  });
  return { ...features, ...derived };
}

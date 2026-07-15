import { computeAbandonmentDerivedFeatures } from './abandonment-derived-features';

describe('computeAbandonmentDerivedFeatures', () => {
  it('matches training pipeline formulas (2 click-miss, low scroll)', () => {
    const derived = computeAbandonmentDerivedFeatures({
      timeOnPage: 72,
      scrollDepth: 5,
      clickMisses: 2,
      hesitations: 0,
      multiplePages: 0,
    });

    expect(derived.pageTime).toBe(72);
    expect(derived.timePerPage).toBeCloseTo(72, 5);
    expect(derived.clickMissRate).toBeCloseTo(2 / 72, 5);
    expect(derived.frictionScore).toBeCloseTo(
      2 * 0.3 + 0 * 0.25 + Math.min(72 / 120, 1) * 0.2 + (1 - 5 / 100) * 0.25,
      5,
    );
    expect(derived.multipleIssues).toBe(0);
  });

  it('flags high friction and multiple issues', () => {
    const derived = computeAbandonmentDerivedFeatures({
      timeOnPage: 100,
      scrollDepth: 40,
      clickMisses: 3,
      hesitations: 2,
      multiplePages: 1,
    });

    expect(derived.timePerPage).toBeCloseTo(50, 5);
    expect(derived.highFriction).toBe(1);
    expect(derived.multipleIssues).toBe(1);
    expect(derived.pageTime).toBe(100);
  });

  it('uses pageTime for timePerPage and friction dwell when provided', () => {
    const withExplicit = computeAbandonmentDerivedFeatures({
      timeOnPage: 95,
      pageTime: 20,
      scrollDepth: 10,
      clickMisses: 0,
      hesitations: 0,
      multiplePages: 1,
    });
    expect(withExplicit.pageTime).toBe(20);
    expect(withExplicit.timePerPage).toBeCloseTo(10, 5); // 20 / 2 pages
    expect(withExplicit.frictionScore).toBeCloseTo(
      0 + 0 + Math.min(20 / 120, 1) * 0.2 + (1 - 10 / 100) * 0.25,
      5,
    );
  });
});

import { PredictionService } from './prediction.service';

describe('PredictionService', () => {
  let service: PredictionService;

  beforeEach(() => {
    service = new PredictionService();
  });

  it('should compute derived features without abandonmentRisk dependency', () => {
    const input = {
      timeOnPage: 100,
      scrollDepth: 40,
      clickMisses: 3,
      hesitations: 2,
      helpTriggered: 0 as const,
      hasError: 0 as const,
      multiplePages: 1 as const,
    };

    const result = (service as any).computeDerivedFeatures(input);

    expect(result.timePerPage).toBe(100);
    expect(result.clickMissRate).toBeCloseTo(0.6, 5);
    expect(result.hesitationRate).toBeCloseTo(0.4, 5);
    expect(result.frictionScore).toBeCloseTo((0.6 * 0.55) + (0.4 * 0.45), 5);
    expect(result.highFriction).toBe(1);
    expect(result.multipleIssues).toBe(1);
    expect(result.abandonmentRisk).toBeUndefined();
  });

  it('should keep provided derived values when present', () => {
    const input = {
      timeOnPage: 90,
      scrollDepth: 80,
      clickMisses: 1,
      hesitations: 0,
      helpTriggered: 0 as const,
      hasError: 0 as const,
      multiplePages: 1 as const,
      clickMissRate: 0.2,
      hesitationRate: 0.1,
      frictionScore: 0.3,
      highFriction: 0 as const,
      multipleIssues: 0 as const,
    };

    const result = (service as any).computeDerivedFeatures(input);

    expect(result.clickMissRate).toBe(0.2);
    expect(result.hesitationRate).toBe(0.1);
    expect(result.frictionScore).toBe(0.3);
    expect(result.highFriction).toBe(0);
    expect(result.multipleIssues).toBe(0);
  });
});

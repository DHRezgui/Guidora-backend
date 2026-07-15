import { PredictionService } from './prediction.service';
import { AbandonmentPythonWorkerService } from './abandonment-python-worker.service';

describe('PredictionService', () => {
  let service: PredictionService;
  let abandonmentWorker: jest.Mocked<Pick<AbandonmentPythonWorkerService, 'infer' | 'isWarmed' | 'warmup'>>;

  beforeEach(() => {
    abandonmentWorker = {
      infer: jest.fn(),
      isWarmed: jest.fn().mockReturnValue(true),
      warmup: jest.fn().mockResolvedValue(true),
    };
    service = new PredictionService(abandonmentWorker as unknown as AbandonmentPythonWorkerService);
    (service as any).modelLoaded = true;
  });

  it('should compute canonical derived features aligned with training', () => {
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

    expect(result.timePerPage).toBeCloseTo(50, 5);
    expect(result.clickMissRate).toBeCloseTo(0.03, 5);
    expect(result.hesitationRate).toBeCloseTo(0.02, 5);
    expect(result.frictionScore).toBeCloseTo(1, 5);
    expect(result.highFriction).toBe(1);
    expect(result.multipleIssues).toBe(1);
    expect(result.abandonmentRisk).toBe(0);
  });

  it('should always recompute derived features from raw inputs', () => {
    const input = {
      timeOnPage: 90,
      scrollDepth: 80,
      clickMisses: 1,
      hesitations: 0,
      helpTriggered: 0 as const,
      hasError: 0 as const,
      multiplePages: 1 as const,
      clickMissRate: 0.99,
      hesitationRate: 0.99,
      frictionScore: 0.99,
      highFriction: 1 as const,
      multipleIssues: 1 as const,
    };

    const result = (service as any).computeDerivedFeatures(input);

    expect(result.clickMissRate).toBeCloseTo(1 / 90, 5);
    expect(result.hesitationRate).toBe(0);
    expect(result.frictionScore).toBeLessThanOrEqual(0.5);
    expect(result.highFriction).toBe(0);
    expect(result.multipleIssues).toBe(0);
  });

  it('should enforce per-session rate limiting', () => {
    const sessionId = '3f50c2a1-8c4d-4f3a-9c2e-1a2b3c4d5e6f';

    expect(() => (service as any).checkSessionRateLimit(sessionId)).not.toThrow();
    (service as any).recordSessionRequest(sessionId);
    expect(() => (service as any).checkSessionRateLimit(sessionId)).toThrow(
      'Abandonment prediction rate limit exceeded',
    );
  });

  it('should return worker_unavailable when the persistent worker fails', async () => {
    abandonmentWorker.infer.mockResolvedValue({
      ok: false,
      reason: 'worker_unavailable',
      error: 'Worker stdin unavailable',
    });

    const result = await service.predict({
      features: {
        timeOnPage: 90,
        scrollDepth: 20,
        clickMisses: 2,
        hesitations: 1,
        helpTriggered: 0,
        hasError: 0,
        multiplePages: 1,
      },
      threshold: 0.4,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('worker_unavailable');
    expect(abandonmentWorker.infer).toHaveBeenCalled();
  });

  it('should attach SHAP explanation when explain and debug are enabled', async () => {
    abandonmentWorker.infer.mockResolvedValue({
      ok: true,
      result: {
        abandonmentRisk: 0.78,
        willAbandon: true,
        confidence: 0.78,
        threshold: 0.4,
        explanation: {
          topFeatures: [{ feature: 'frictionScore', contribution: 0.12, value: 0.82 }],
          expectedValue: -0.35,
          baseProbability: 0.41,
        },
      },
    });

    const result = await service.predict({
      features: {
        timeOnPage: 180,
        scrollDepth: 12,
        clickMisses: 3,
        hesitations: 2,
        helpTriggered: 1,
        hasError: 0,
        multiplePages: 0,
      },
      threshold: 0.4,
      explain: true,
      debug: true,
    });

    expect(result.success).toBe(true);
    expect(result.prediction?.abandonmentRisk).toBe(0.78);
    expect(result.prediction?.explanation?.topFeatures).toHaveLength(1);
    expect(result.prediction?.explanation?.baseProbability).toBe(0.41);
    expect(abandonmentWorker.infer).toHaveBeenCalledWith(
      expect.any(Object),
      0.4,
      { explain: true, debug: true },
      12_000,
    );
  });

  it('should return prediction from the persistent worker', async () => {
    abandonmentWorker.infer.mockResolvedValue({
      ok: true,
      result: {
        abandonmentRisk: 0.78,
        willAbandon: true,
        confidence: 0.78,
        threshold: 0.4,
      },
    });

    const result = await service.predict({
      features: {
        timeOnPage: 180,
        scrollDepth: 12,
        clickMisses: 3,
        hesitations: 2,
        helpTriggered: 1,
        hasError: 0,
        multiplePages: 0,
      },
      threshold: 0.4,
    });

    expect(result.success).toBe(true);
    expect(result.prediction?.abandonmentRisk).toBe(0.78);
    expect(result.prediction?.willAbandon).toBe(true);
  });

  it('should expose workerReady in model health', async () => {
    abandonmentWorker.isWarmed.mockReturnValue(false);

    const health = await service.getModelHealth();

    expect(health.workerReady).toBe(false);
  });
});

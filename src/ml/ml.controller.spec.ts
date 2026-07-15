import { Test, TestingModule } from '@nestjs/testing';
import { MlController } from './ml.controller';
import { DatasetGeneratorService } from './dataset-generator.service';
import { BehaviorAnalysisService } from '../behavior-analysis/behavior-analysis.service';
import { PredictionService } from './prediction.service';

describe('MlController', () => {
  let controller: MlController;
  const datasetService = {
    generateDataset: jest.fn(),
    getDatasetQualityReport: jest.fn(),
  };
  const behaviorAnalysisService = {
    analyzeOrganizationSessions: jest.fn(),
  };
  const predictionService = {
    predict: jest.fn(),
    getModelHealth: jest.fn(),
    warmupAbandonmentWorker: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MlController],
      providers: [
        {
          provide: DatasetGeneratorService,
          useValue: datasetService,
        },
        {
          provide: BehaviorAnalysisService,
          useValue: behaviorAnalysisService,
        },
        {
          provide: PredictionService,
          useValue: predictionService,
        },
      ],
    }).compile();

    controller = module.get<MlController>(MlController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return dataset stats with quality indicators', async () => {
    datasetService.getDatasetQualityReport.mockResolvedValue({
      schemaVersion: '1.2',
      totalSamples: 120,
      positiveSamples: 30,
      negativeSamples: 90,
      realLabels: 40,
      syntheticLabels: 80,
      realLabelRatio: 40 / 120,
      imbalanceRatio: 0.25,
      missingValues: 0,
      isEnoughDataForTraining: true,
      hasAcceptableClassBalance: true,
      featuresPerSample: 12,
    });

    const result = await controller.getDatasetStats('org-1');

    expect(result.success).toBe(true);
    expect(result.stats.totalSamples).toBe(120);
    expect(result.stats.schemaVersion).toBe('1.2');
    expect(result.stats.realLabels).toBe(40);
    expect(datasetService.getDatasetQualityReport).toHaveBeenCalledWith('org-1');
  });

  it('should refresh dataset source and return quality', async () => {
    behaviorAnalysisService.analyzeOrganizationSessions.mockResolvedValue(18);
    datasetService.getDatasetQualityReport.mockResolvedValue({
      schemaVersion: '1.1',
      totalSamples: 200,
    });

    const result = await controller.refreshDatasetSource('org-1');

    expect(result.success).toBe(true);
    expect(result.processedSessions).toBe(18);
    expect(result.datasetQuality.schemaVersion).toBe('1.1');
    expect(behaviorAnalysisService.analyzeOrganizationSessions).toHaveBeenCalledWith('org-1');
  });

  it('should return single abandonment prediction', async () => {
    predictionService.predict.mockResolvedValue({
      success: true,
      prediction: {
        abandonmentRisk: 0.325,
        willAbandon: false,
        confidence: 0.95,
        threshold: 0.5,
      },
      timestamp: '2026-03-25T10:30:00.000Z',
      metadata: {
        modelVersion: '1.0',
        executionTimeMs: 145,
      },
    });

    const request = {
      features: {
        timeOnPage: 83,
        scrollDepth: 41.4,
        clickMisses: 2,
        hesitations: 1,
        helpTriggered: 0 as const,
        hasError: 0 as const,
        multiplePages: 1 as const,
      },
      threshold: 0.5,
    };

    const result = await controller.predictAbandonment(request);

    expect(result.success).toBe(true);
    expect(result.prediction?.abandonmentRisk).toBe(0.325);
    expect(predictionService.predict).toHaveBeenCalledWith(request);
  });

  it('should return batch predictions', async () => {
    predictionService.predict
      .mockResolvedValueOnce({
        success: true,
        prediction: {
          abandonmentRisk: 0.325,
          willAbandon: false,
          confidence: 0.95,
          threshold: 0.5,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        prediction: {
          abandonmentRisk: 0.812,
          willAbandon: true,
          confidence: 0.91,
          threshold: 0.5,
        },
      });

    const request = {
      predictions: [
        {
          features: {
            timeOnPage: 83,
            scrollDepth: 41.4,
            clickMisses: 2,
            hesitations: 1,
            helpTriggered: 0 as const,
            hasError: 0 as const,
            multiplePages: 1 as const,
          },
        },
        {
          features: {
            timeOnPage: 180,
            scrollDepth: 12,
            clickMisses: 3,
            hesitations: 2,
            helpTriggered: 1 as const,
            hasError: 0 as const,
            multiplePages: 0 as const,
          },
        },
      ],
    };

    const result = await controller.batchPredict(request);

    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(result.predictions).toHaveLength(2);
    expect(predictionService.predict).toHaveBeenCalledTimes(2);
  });

  it('should return model health', async () => {
    predictionService.getModelHealth.mockResolvedValue({
      success: true,
      modelLoaded: true,
      workerReady: true,
      modelVersion: '1.0',
      featureCount: 13,
      lastUpdated: '2026-03-25T10:30:00.000Z',
    });

    const result = await controller.checkModelHealth();

    expect(result.success).toBe(true);
    expect(result.modelLoaded).toBe(true);
    expect(result.workerReady).toBe(true);
    expect(result.featureCount).toBe(13);
    expect(predictionService.getModelHealth).toHaveBeenCalled();
  });

  it('should warm up abandonment worker', async () => {
    predictionService.warmupAbandonmentWorker.mockResolvedValue({
      success: true,
      workerReady: true,
      modelLoaded: true,
    });

    const result = await controller.warmupAbandonmentWorker();

    expect(result.success).toBe(true);
    expect(result.workerReady).toBe(true);
    expect(predictionService.warmupAbandonmentWorker).toHaveBeenCalled();
  });
});

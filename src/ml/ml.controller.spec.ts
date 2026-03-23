import { Test, TestingModule } from '@nestjs/testing';
import { MlController } from './ml.controller';
import { DatasetGeneratorService } from './dataset-generator.service';
import { BehaviorAnalysisService } from '../behavior-analysis/behavior-analysis.service';

describe('MlController', () => {
  let controller: MlController;
  const datasetService = {
    generateDataset: jest.fn(),
    getDatasetQualityReport: jest.fn(),
  };
  const behaviorAnalysisService = {
    analyzeOrganizationSessions: jest.fn(),
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
      schemaVersion: '1.1',
      totalSamples: 120,
      positiveSamples: 30,
      negativeSamples: 90,
      imbalanceRatio: 0.25,
      missingValues: 0,
      isEnoughDataForTraining: true,
      hasAcceptableClassBalance: true,
      featuresPerSample: 12,
    });

    const result = await controller.getDatasetStats('org-1');

    expect(result.success).toBe(true);
    expect(result.stats.totalSamples).toBe(120);
    expect(result.stats.schemaVersion).toBe('1.1');
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
});

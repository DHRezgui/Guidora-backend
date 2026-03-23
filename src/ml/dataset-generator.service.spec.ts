import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DatasetGeneratorService } from './dataset-generator.service';
import { BehaviorAnalysis } from '../behavior-analysis/entities/behavior-analysis.entity';

describe('DatasetGeneratorService', () => {
  let service: DatasetGeneratorService;
  const analysisRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetGeneratorService,
        {
          provide: getRepositoryToken(BehaviorAnalysis),
          useValue: analysisRepository,
        },
      ],
    }).compile();

    service = module.get<DatasetGeneratorService>(DatasetGeneratorService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate dataset with versioned metadata', async () => {
    analysisRepository.find.mockResolvedValue([
      {
        sessionId: 's1',
        userId: 'u1',
        analyzedAt: new Date(),
        timeOnPage: 60,
        scrollDepth: 50,
        clickMisses: 1,
        hesitations: 0,
        abandonmentRisk: 0.2,
        helpTriggered: false,
        analysisData: { errorCount: 0, uniquePages: 2 },
      },
    ]);

    const dataset = await service.generateDataset('org-1');

    expect(dataset.organizationId).toBe('org-1');
    expect(dataset.totalSamples).toBe(1);
    expect(dataset.metadata.version).toBe('1.1');
    expect(dataset.metadata.featureNames.length).toBeGreaterThan(0);
  });

  it('should produce dataset quality report', async () => {
    analysisRepository.find.mockResolvedValue([
      {
        sessionId: 's1',
        userId: 'u1',
        analyzedAt: new Date(),
        timeOnPage: 120,
        scrollDepth: 40,
        clickMisses: 2,
        hesitations: 1,
        abandonmentRisk: 0.8,
        helpTriggered: true,
        analysisData: { errorCount: 1, uniquePages: 1 },
      },
      {
        sessionId: 's2',
        userId: 'u2',
        analyzedAt: new Date(),
        timeOnPage: 20,
        scrollDepth: 90,
        clickMisses: 0,
        hesitations: 0,
        abandonmentRisk: 0.1,
        helpTriggered: false,
        analysisData: { errorCount: 0, uniquePages: 2 },
      },
    ]);

    const quality = await service.getDatasetQualityReport('org-1');

    expect(quality.totalSamples).toBe(2);
    expect(quality.positiveSamples).toBe(1);
    expect(quality.negativeSamples).toBe(1);
    expect(quality.schemaVersion).toBe('1.1');
  });
});

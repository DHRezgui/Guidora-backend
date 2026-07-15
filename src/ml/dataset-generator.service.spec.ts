import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatasetGeneratorService } from './dataset-generator.service';

describe('DatasetGeneratorService', () => {
  let service: DatasetGeneratorService;
  const dataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetGeneratorService,
        {
          provide: DataSource,
          useValue: dataSource,
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
    dataSource.query.mockResolvedValue([
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
        progressStatus: 'COMPLETED',
        isAbandoned: false,
      },
    ]);

    const dataset = await service.generateDataset('org-1');

    expect(dataset.organizationId).toBe('org-1');
    expect(dataset.totalSamples).toBe(1);
    expect(dataset.metadata.version).toBe('1.2');
    expect(dataset.features[0].labelSource).toBe('real');
    expect(dataset.features[0].label).toBe(0);
    expect(dataset.metadata.labelSourceCounts?.real).toBe(1);
  });

  it('should fall back to synthetic labels when user_progress is unknown', async () => {
    dataSource.query.mockResolvedValue([
      {
        sessionId: 's2',
        userId: 'u2',
        analyzedAt: new Date(),
        timeOnPage: 120,
        scrollDepth: 20,
        clickMisses: 2,
        hesitations: 2,
        abandonmentRisk: 0.5,
        helpTriggered: false,
        progressStatus: 'IN_PROGRESS',
        isAbandoned: null,
      },
    ]);

    const dataset = await service.generateDataset('org-1');

    expect(dataset.features[0].labelSource).toBe('synthetic');
    expect(dataset.features[0].label).toBe(1);
    expect(dataset.metadata.labelSourceCounts?.synthetic).toBe(1);
  });

  it('should produce dataset quality report with label source counts', async () => {
    dataSource.query.mockResolvedValue([
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
        progressStatus: 'ABANDONED',
        isAbandoned: true,
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
        progressStatus: null,
        isAbandoned: null,
      },
    ]);

    const quality = await service.getDatasetQualityReport('org-1');

    expect(quality.totalSamples).toBe(2);
    expect(quality.positiveSamples).toBe(1);
    expect(quality.negativeSamples).toBe(1);
    expect(quality.realLabels).toBe(1);
    expect(quality.syntheticLabels).toBe(1);
    expect(quality.schemaVersion).toBe('1.2');
  });
});

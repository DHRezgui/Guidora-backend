import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataAggregationService } from './data-aggregation.service';
import { BehaviorEvent } from '../tracking/entities/behavior_event.entity';

describe('DataAggregationService', () => {
  let service: DataAggregationService;
  const eventRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAggregationService,
        {
          provide: getRepositoryToken(BehaviorEvent),
          useValue: eventRepository,
        },
      ],
    }).compile();

    service = module.get<DataAggregationService>(DataAggregationService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty aggregated data when no events', async () => {
    eventRepository.find.mockResolvedValue([]);

    const result = await service.aggregateBySession('session-1');

    expect(result.totalEvents).toBe(0);
    expect(result.frictionPoints).toEqual([]);
    expect(result.userJourney).toEqual([]);
  });

  it('should aggregate metrics and detect friction points', async () => {
    const baseDate = new Date('2026-03-20T10:00:00.000Z');
    const events = [
      {
        eventType: 'PAGE_VIEW',
        pageUrl: '/onboarding',
        timeOnPage: 130,
        scrollDepth: 20,
        timestamp: baseDate,
      },
      {
        eventType: 'CLICK',
        pageUrl: '/onboarding',
        elementSelector: '#next',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
      {
        eventType: 'HOVER',
        pageUrl: '/onboarding',
        timestamp: new Date(baseDate.getTime() + 2000),
      },
      {
        eventType: 'SCROLL',
        pageUrl: '/onboarding',
        timestamp: new Date(baseDate.getTime() + 3000),
      },
      {
        eventType: 'SCROLL',
        pageUrl: '/onboarding',
        timestamp: new Date(baseDate.getTime() + 9500),
      },
    ];

    eventRepository.find.mockResolvedValue(events as any);

    const result = await service.aggregateBySession('session-1');

    expect(result.totalEvents).toBe(5);
    expect(result.totalClicks).toBe(1);
    expect(result.totalScrolls).toBe(2);
    expect(result.frictionPoints.length).toBeGreaterThan(0);
    expect(result.userJourney.length).toBeGreaterThan(0);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BehaviorAnalysisService } from './behavior-analysis.service';
import { BehaviorAnalysis } from './entities/behavior-analysis.entity';
import { BehaviorEvent } from '../tracking/entities/behavior_event.entity';
import { EventType } from '../tracking/enums/tracking.enums';

describe('BehaviorAnalysisService', () => {
  let service: BehaviorAnalysisService;
  let eventRepo: jest.Mocked<Repository<BehaviorEvent>>;
  let analysisRepo: jest.Mocked<Repository<BehaviorAnalysis>>;
  let dataSource: jest.Mocked<DataSource>;

  const makeMockEvent = (overrides: Partial<BehaviorEvent> = {}): BehaviorEvent =>
    ({
      id: 'evt-uuid-1',
      userId: 'usr-uuid-1',
      sessionId: 'sess-uuid-1',
      organizationId: 'org-uuid-1',
      eventType: EventType.CLICK,
      pageUrl: '/dashboard',
      elementSelector: '#btn',
      elementText: 'Submit',
      scrollDepth: 60,
      timeOnPage: 30,
      metadata: {},
      timestamp: new Date('2026-02-15T10:00:00Z'),
      ...overrides,
    }) as BehaviorEvent;

  const mockAnalysis: Partial<BehaviorAnalysis> = {
    id: 'analysis-uuid-1',
    sessionId: 'sess-uuid-1',
    organizationId: 'org-uuid-1',
    pageUrl: '/dashboard',
    timeOnPage: 30,
    scrollDepth: 60,
    clickMisses: 0,
    hesitations: 0,
    abandonmentRisk: 0.2,
    helpTriggered: false,
    analysisData: {},
    analyzedAt: new Date('2026-02-15T10:30:00Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviorAnalysisService,
        {
          provide: getRepositoryToken(BehaviorEvent),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BehaviorAnalysis),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BehaviorAnalysisService>(BehaviorAnalysisService);
    eventRepo = module.get(getRepositoryToken(BehaviorEvent));
    analysisRepo = module.get(getRepositoryToken(BehaviorAnalysis));
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── analyzeSession ──────────────────────────────────────────
  describe('analyzeSession', () => {
    it('should analyze a session with events and save analysis', async () => {
      const events = [
        makeMockEvent({ eventType: EventType.PAGE_VIEW, timeOnPage: 20, scrollDepth: 50 }),
        makeMockEvent({ eventType: EventType.CLICK, timeOnPage: 30, scrollDepth: 70, timestamp: new Date('2026-02-15T10:01:00Z') }),
        makeMockEvent({ eventType: EventType.SCROLL, timeOnPage: 40, scrollDepth: 80, timestamp: new Date('2026-02-15T10:02:00Z') }),
      ];

      eventRepo.find.mockResolvedValue(events);
      analysisRepo.findOne.mockResolvedValue(null);
      analysisRepo.create.mockReturnValue(mockAnalysis as BehaviorAnalysis);
      analysisRepo.save.mockResolvedValue(mockAnalysis as BehaviorAnalysis);

      const result = await service.analyzeSession('sess-uuid-1', 'org-uuid-1');

      expect(eventRepo.find).toHaveBeenCalledWith({
        where: { sessionId: 'sess-uuid-1', organizationId: 'org-uuid-1' },
        order: { timestamp: 'ASC' },
      });
      expect(analysisRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-uuid-1',
          organizationId: 'org-uuid-1',
          userId: 'usr-uuid-1',
          pageUrl: '/dashboard',
        }),
      );
      expect(analysisRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockAnalysis);
    });

    it('should throw error when no events found', async () => {
      eventRepo.find.mockResolvedValue([]);

      await expect(service.analyzeSession('sess-none', 'org-uuid-1')).rejects.toThrow(
        'Aucun événement trouvé pour la session sess-none',
      );
    });

    it('should set helpTriggered true when risk > 0.65', async () => {
      // Events crafted to trigger multiple risk factors:
      // - avgTimeOnPage > 120 → +0.20
      // - avgScrollDepth < 30  → +0.15
      // - clickMisses > 2      → +0.25  (3 CLICK→HOVER <2s pairs)
      // - hesitations > 1      → +0.20  (2 SCROLL gaps >5s)
      // Total = 0.80 > 0.65
      const events = [
        makeMockEvent({ eventType: EventType.CLICK, timeOnPage: 200, scrollDepth: 10, timestamp: new Date('2026-02-15T10:00:00Z') }),
        makeMockEvent({ eventType: EventType.HOVER, timeOnPage: 200, scrollDepth: 10, timestamp: new Date('2026-02-15T10:00:01Z') }),
        makeMockEvent({ eventType: EventType.CLICK, timeOnPage: 200, scrollDepth: 10, timestamp: new Date('2026-02-15T10:00:02Z') }),
        makeMockEvent({ eventType: EventType.HOVER, timeOnPage: 200, scrollDepth: 10, timestamp: new Date('2026-02-15T10:00:03Z') }),
        makeMockEvent({ eventType: EventType.CLICK, timeOnPage: 200, scrollDepth: 10, timestamp: new Date('2026-02-15T10:00:04Z') }),
        makeMockEvent({ eventType: EventType.HOVER, timeOnPage: 200, scrollDepth: 10, timestamp: new Date('2026-02-15T10:00:05Z') }),
        makeMockEvent({ eventType: EventType.SCROLL, timeOnPage: 200, scrollDepth: 10, timestamp: new Date('2026-02-15T10:00:06Z') }),
        makeMockEvent({ eventType: EventType.SCROLL, timeOnPage: 200, scrollDepth: 10, timestamp: new Date('2026-02-15T10:00:12Z') }),
        makeMockEvent({ eventType: EventType.SCROLL, timeOnPage: 200, scrollDepth: 10, timestamp: new Date('2026-02-15T10:00:20Z') }),
      ];

      eventRepo.find.mockResolvedValue(events);
      analysisRepo.findOne.mockResolvedValue(null);
      analysisRepo.create.mockImplementation((dto) => dto as BehaviorAnalysis);
      analysisRepo.save.mockImplementation(async (entity) => entity as BehaviorAnalysis);

      const result = await service.analyzeSession('sess-uuid-1', 'org-uuid-1');

      expect(result.helpTriggered).toBe(true);
      expect(result.abandonmentRisk).toBeGreaterThan(0.65);
    });
  });

  // ── analyzeOrganizationSessions ─────────────────────────────
  describe('analyzeOrganizationSessions', () => {
    it('should process all sessions of an organization', async () => {
      const sessions = [{ session_id: 'sess-1' }, { session_id: 'sess-2' }];
      dataSource.query.mockResolvedValue(sessions);

      // Mock analyzeSession indirectly via eventRepo
      const events = [makeMockEvent()];
      eventRepo.find.mockResolvedValue(events);
      analysisRepo.findOne.mockResolvedValue(null);
      analysisRepo.create.mockReturnValue(mockAnalysis as BehaviorAnalysis);
      analysisRepo.save.mockResolvedValue(mockAnalysis as BehaviorAnalysis);

      const count = await service.analyzeOrganizationSessions('org-uuid-1');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT session_id'),
        ['org-uuid-1'],
      );
      expect(count).toBe(2);
    });

    it('should return 0 when no sessions exist', async () => {
      dataSource.query.mockResolvedValue([]);

      const count = await service.analyzeOrganizationSessions('org-empty');

      expect(count).toBe(0);
    });

    it('should continue processing on individual session errors', async () => {
      const sessions = [{ session_id: 'sess-ok' }, { session_id: 'sess-fail' }];
      dataSource.query.mockResolvedValue(sessions);

      let callCount = 0;
      eventRepo.find.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) return []; // Will throw "Aucun événement"
        return [makeMockEvent()];
      });
      analysisRepo.create.mockReturnValue(mockAnalysis as BehaviorAnalysis);
      analysisRepo.save.mockResolvedValue(mockAnalysis as BehaviorAnalysis);

      const count = await service.analyzeOrganizationSessions('org-uuid-1');

      // Only 1 succeeded, 1 failed silently
      expect(count).toBe(1);
    });
  });

  // ── prepareMLDataset ────────────────────────────────────────
  describe('prepareMLDataset', () => {
    it('should return ML dataset rows', async () => {
      const mockRows = [
        { session_id: 's1', abandonment_risk: 0.78, total_events: 25 },
        { session_id: 's2', abandonment_risk: 0.12, total_events: 8 },
      ];
      dataSource.query.mockResolvedValue(mockRows);

      const result = await service.prepareMLDataset('org-uuid-1');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('behavior_analysis ba'),
        ['org-uuid-1'],
      );
      expect(result).toEqual(mockRows);
      expect(result).toHaveLength(2);
    });
  });

  // ── exportMLData ────────────────────────────────────────────
  describe('exportMLData', () => {
    it('should return CSV string with headers', async () => {
      const mockRows = [
        {
          session_id: 's1', user_id: 'u1', time_on_page: 45, scroll_depth: 65,
          click_misses: 2, hesitations: 1, abandonment_risk: 0.78,
          help_triggered: true, completion_rate: 0.5, is_abandoned: false,
          total_events: 25, click_count: 10, scroll_count: 8, hover_count: 7,
        },
      ];
      dataSource.query.mockResolvedValue(mockRows);

      const csv = await service.exportMLData('org-uuid-1');

      expect(csv).toContain('session_id,user_id,time_on_page');
      expect(csv).toContain('"s1"');
    });
  });

  // ── getOrganizationStats ────────────────────────────────────
  describe('getOrganizationStats', () => {
    it('should return aggregated stats', async () => {
      const mockStats = [{ total_sessions: 100, total_users: 50, avg_time_on_page: 40 }];
      dataSource.query.mockResolvedValue(mockStats);

      const result = await service.getOrganizationStats('org-uuid-1');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('AVG(ba.time_on_page)'),
        ['org-uuid-1'],
      );
      expect(result).toEqual(mockStats[0]);
    });
  });

  // ── getTimeSeriesData ───────────────────────────────────────
  describe('getTimeSeriesData', () => {
    it('should return time series data with default 30 days', async () => {
      const mockData = [
        { date: '2026-02-15', sessions: 42, avg_risk: 0.35 },
      ];
      dataSource.query.mockResolvedValue(mockData);

      const result = await service.getTimeSeriesData('org-uuid-1');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 day'"),
        ['org-uuid-1', 30],
      );
      expect(result).toEqual(mockData);
    });

    it('should accept custom days parameter', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTimeSeriesData('org-uuid-1', 7);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 day'"),
        ['org-uuid-1', 7],
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BehaviorAnalysisController } from './behavior-analysis.controller';
import { BehaviorAnalysisService } from './behavior-analysis.service';
import { BehaviorAnalysis } from './entities/behavior-analysis.entity';

describe('BehaviorAnalysisController', () => {
  let controller: BehaviorAnalysisController;
  let service: BehaviorAnalysisService;

  const mockAnalysisService = {
    analyzeSession: jest.fn(),
    analyzeOrganizationSessions: jest.fn(),
    getOrganizationStats: jest.fn(),
    getTimeSeriesData: jest.fn(),
    prepareMLDataset: jest.fn(),
    exportMLData: jest.fn(),
  };

  const mockAnalysis: Partial<BehaviorAnalysis> = {
    id: 'analysis-uuid-1',
    sessionId: 'sess-uuid-1',
    organizationId: 'org-uuid-1',
    pageUrl: '/dashboard',
    timeOnPage: 45,
    scrollDepth: 65.5,
    clickMisses: 2,
    hesitations: 1,
    abandonmentRisk: 0.45,
    helpTriggered: false,
    analysisData: { totalEvents: 12, eventTypes: { CLICK: 5, SCROLL: 7 } },
    analyzedAt: new Date('2026-02-15T10:30:00.000Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviorAnalysisController],
      providers: [
        { provide: BehaviorAnalysisService, useValue: mockAnalysisService },
      ],
    }).compile();

    controller = module.get<BehaviorAnalysisController>(BehaviorAnalysisController);
    service = module.get<BehaviorAnalysisService>(BehaviorAnalysisService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── analyzeSession ──────────────────────────────────────────
  describe('analyzeSession', () => {
    it('should analyze a session and return success', async () => {
      mockAnalysisService.analyzeSession.mockResolvedValue(mockAnalysis);

      const result = await controller.analyzeSession('sess-uuid-1', 'org-uuid-1');

      expect(result).toEqual({
        success: true,
        message: 'Analyse effectuée',
        analysis: mockAnalysis,
      });
      expect(mockAnalysisService.analyzeSession).toHaveBeenCalledWith('sess-uuid-1', 'org-uuid-1');
    });

    it('should propagate service errors', async () => {
      mockAnalysisService.analyzeSession.mockRejectedValue(
        new Error('Aucun événement trouvé pour la session sess-none'),
      );

      await expect(controller.analyzeSession('sess-none', 'org-uuid-1')).rejects.toThrow(
        'Aucun événement trouvé',
      );
    });
  });

  // ── analyzeOrganization ─────────────────────────────────────
  describe('analyzeOrganization', () => {
    it('should analyze all sessions and return count', async () => {
      mockAnalysisService.analyzeOrganizationSessions.mockResolvedValue(150);

      const result = await controller.analyzeOrganization('org-uuid-1');

      expect(result).toEqual({
        success: true,
        message: 'Analyse en cours',
        processedSessions: 150,
      });
      expect(mockAnalysisService.analyzeOrganizationSessions).toHaveBeenCalledWith('org-uuid-1');
    });

    it('should return 0 when no sessions', async () => {
      mockAnalysisService.analyzeOrganizationSessions.mockResolvedValue(0);

      const result = await controller.analyzeOrganization('org-empty');

      expect(result.processedSessions).toBe(0);
    });
  });

  // ── getOrganizationStats ────────────────────────────────────
  describe('getOrganizationStats', () => {
    const mockStats = {
      total_sessions: 1250,
      total_users: 350,
      avg_time_on_page: 45.5,
      avg_scroll_depth: 65.2,
      avg_abandonment_risk: 0.32,
      help_triggered_count: 87,
      high_risk_count: 42,
    };

    it('should return organization stats', async () => {
      mockAnalysisService.getOrganizationStats.mockResolvedValue(mockStats);

      const result = await controller.getOrganizationStats('org-uuid-1');

      expect(result).toEqual({ success: true, stats: mockStats });
      expect(mockAnalysisService.getOrganizationStats).toHaveBeenCalledWith('org-uuid-1');
    });
  });

  // ── getTimeSeries ───────────────────────────────────────────
  describe('getTimeSeries', () => {
    const mockTrends = [
      { date: '2026-02-15', sessions: 42, users: 18, avg_risk: 0.35 },
      { date: '2026-02-14', sessions: 38, users: 15, avg_risk: 0.41 },
    ];

    it('should return time series data with default days', async () => {
      mockAnalysisService.getTimeSeriesData.mockResolvedValue(mockTrends);

      const result = await controller.getTimeSeries('org-uuid-1', 30);

      expect(result).toEqual({ success: true, days: 30, data: mockTrends });
      expect(mockAnalysisService.getTimeSeriesData).toHaveBeenCalledWith('org-uuid-1', 30);
    });

    it('should pass custom days parameter', async () => {
      mockAnalysisService.getTimeSeriesData.mockResolvedValue([]);

      const result = await controller.getTimeSeries('org-uuid-1', 7);

      expect(result.days).toBe(7);
      expect(mockAnalysisService.getTimeSeriesData).toHaveBeenCalledWith('org-uuid-1', 7);
    });
  });

  // ── getMLDataset ────────────────────────────────────────────
  describe('getMLDataset', () => {
    const mockDataset = [
      { session_id: 's1', abandonment_risk: 0.78, total_events: 25 },
      { session_id: 's2', abandonment_risk: 0.12, total_events: 8 },
    ];

    it('should return ML dataset with count', async () => {
      mockAnalysisService.prepareMLDataset.mockResolvedValue(mockDataset);

      const result = await controller.getMLDataset('org-uuid-1');

      expect(result).toEqual({
        success: true,
        count: 2,
        dataset: mockDataset,
      });
      expect(mockAnalysisService.prepareMLDataset).toHaveBeenCalledWith('org-uuid-1');
    });

    it('should return empty dataset', async () => {
      mockAnalysisService.prepareMLDataset.mockResolvedValue([]);

      const result = await controller.getMLDataset('org-uuid-1');

      expect(result.count).toBe(0);
      expect(result.dataset).toEqual([]);
    });
  });

  // ── exportMLData ────────────────────────────────────────────
  describe('exportMLData', () => {
    const mockCsv = 'session_id,abandonment_risk\ns1,0.78\ns2,0.12';

    it('should return CSV export with filename', async () => {
      mockAnalysisService.exportMLData.mockResolvedValue(mockCsv);

      const result = await controller.exportMLData('org-uuid-1');

      expect(result.success).toBe(true);
      expect(result.contentType).toBe('text/csv');
      expect(result.data).toBe(mockCsv);
      expect(result.filename).toContain('ml_dataset_org-uuid-1_');
      expect(mockAnalysisService.exportMLData).toHaveBeenCalledWith('org-uuid-1');
    });
  });
});

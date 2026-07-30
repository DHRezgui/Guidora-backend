import { Test, TestingModule } from '@nestjs/testing';
import { TrackingAnalyticsController } from './tracking-analytics.controller';
import { TrackingService } from './tracking.service';
import { EventType } from './enums/tracking.enums';
import { BehaviorEvent } from './entities/behavior_event.entity';
import { UserRole } from '../user/entities/user.entity';

describe('TrackingAnalyticsController', () => {
  let controller: TrackingAnalyticsController;
  let service: TrackingService;

  const mockTrackingService = {
    findEventsBySession: jest.fn(),
    analyzeSessionFrictions: jest.fn(),
    findEventsByOrganization: jest.fn(),
  };

  const mockUser = {
    role: UserRole.ADMIN,
    organizationId: 'org-uuid-1',
  };

  const makeMockEvent = (overrides: Partial<BehaviorEvent> = {}): BehaviorEvent =>
    ({
      id: 'evt-uuid-1',
      userId: 'usr-uuid-1',
      sessionId: 'sess-uuid-1',
      organizationId: 'org-uuid-1',
      eventType: EventType.CLICK,
      pageUrl: '/dashboard/transfers',
      elementSelector: '#transfer-button',
      elementText: 'Virement',
      scrollDepth: null,
      timeOnPage: 30,
      metadata: {},
      timestamp: new Date('2026-02-15T10:30:00.000Z'),
      ...overrides,
    }) as BehaviorEvent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackingAnalyticsController],
      providers: [
        {
          provide: TrackingService,
          useValue: mockTrackingService,
        },
      ],
    }).compile();

    controller = module.get<TrackingAnalyticsController>(TrackingAnalyticsController);
    service = module.get<TrackingService>(TrackingService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSessionEvents', () => {
    const sessionId = 'sess-uuid-1';
    const events = [
      makeMockEvent({ id: 'evt-1' }),
      makeMockEvent({ id: 'evt-2', eventType: EventType.SCROLL }),
    ];

    it("devrait retourner les événements d'une session", async () => {
      mockTrackingService.findEventsBySession.mockResolvedValue(events);

      const result = await controller.getSessionEvents(sessionId, 100, mockUser);

      expect(service.findEventsBySession).toHaveBeenCalledWith(sessionId, 100, 'org-uuid-1');
      expect(result).toEqual({
        success: true,
        count: 2,
        events,
      });
    });

    it('devrait retourner un tableau vide si aucun événement', async () => {
      mockTrackingService.findEventsBySession.mockResolvedValue([]);

      const result = await controller.getSessionEvents(sessionId, 100, mockUser);

      expect(result.count).toBe(0);
      expect(result.events).toEqual([]);
    });

    it('devrait transmettre la limite personnalisée', async () => {
      mockTrackingService.findEventsBySession.mockResolvedValue([events[0]]);

      await controller.getSessionEvents(sessionId, 1, mockUser);

      expect(service.findEventsBySession).toHaveBeenCalledWith(sessionId, 1, 'org-uuid-1');
    });

    it('devrait utiliser la limite par défaut (100)', async () => {
      mockTrackingService.findEventsBySession.mockResolvedValue(events);

      await controller.getSessionEvents(sessionId, undefined as any, mockUser);

      expect(service.findEventsBySession).toHaveBeenCalledWith(sessionId, 100, 'org-uuid-1');
    });

    it('devrait propager une erreur du service', async () => {
      mockTrackingService.findEventsBySession.mockRejectedValue(new Error('DB error'));

      await expect(controller.getSessionEvents(sessionId, 100, mockUser)).rejects.toThrow('DB error');
    });
  });

  describe('analyzeSessionFrictions', () => {
    const sessionId = 'sess-uuid-1';

    it('devrait analyser les frictions et retourner un niveau de risque NONE', async () => {
      const frictions = {
        clickMisses: 0,
        scrollHesitations: 0,
        excessiveTimeOnPage: 0,
        formAbandonments: 0,
        navigationBacks: 0,
      };
      mockTrackingService.analyzeSessionFrictions.mockResolvedValue(frictions);

      const result = await controller.analyzeSessionFrictions(sessionId, mockUser);

      expect(service.analyzeSessionFrictions).toHaveBeenCalledWith(sessionId, 'org-uuid-1');
      expect(result).toEqual({
        success: true,
        sessionId,
        frictions,
        riskLevel: 'NONE',
      });
    });

    it('devrait retourner LOW pour 2-4 frictions', async () => {
      const frictions = {
        clickMisses: 2,
        scrollHesitations: 0,
        excessiveTimeOnPage: 0,
        formAbandonments: 0,
        navigationBacks: 0,
      };
      mockTrackingService.analyzeSessionFrictions.mockResolvedValue(frictions);

      const result = await controller.analyzeSessionFrictions(sessionId, mockUser);

      expect(result.riskLevel).toBe('LOW');
    });

    it('devrait retourner MEDIUM pour 5-9 frictions', async () => {
      const frictions = {
        clickMisses: 3,
        scrollHesitations: 2,
        excessiveTimeOnPage: 0,
        formAbandonments: 0,
        navigationBacks: 0,
      };
      mockTrackingService.analyzeSessionFrictions.mockResolvedValue(frictions);

      const result = await controller.analyzeSessionFrictions(sessionId, mockUser);

      expect(result.riskLevel).toBe('MEDIUM');
    });

    it('devrait retourner HIGH pour 10+ frictions', async () => {
      const frictions = {
        clickMisses: 5,
        scrollHesitations: 3,
        excessiveTimeOnPage: 2,
        formAbandonments: 0,
        navigationBacks: 0,
      };
      mockTrackingService.analyzeSessionFrictions.mockResolvedValue(frictions);

      const result = await controller.analyzeSessionFrictions(sessionId, mockUser);

      expect(result.riskLevel).toBe('HIGH');
    });

    it('devrait propager une erreur du service', async () => {
      mockTrackingService.analyzeSessionFrictions.mockRejectedValue(new Error('Session not found'));

      await expect(controller.analyzeSessionFrictions(sessionId, mockUser)).rejects.toThrow(
        'Session not found',
      );
    });
  });

  describe('getOrganizationEvents', () => {
    const orgId = 'org-uuid-1';
    const events = [makeMockEvent(), makeMockEvent({ id: 'evt-uuid-2' })];

    it("devrait retourner les événements d'une organisation sans filtres", async () => {
      mockTrackingService.findEventsByOrganization.mockResolvedValue(events);

      const result = await controller.getOrganizationEvents(orgId, mockUser);

      expect(service.findEventsByOrganization).toHaveBeenCalledWith(orgId, {
        eventType: undefined,
        startDate: undefined,
        endDate: undefined,
        pageUrl: undefined,
        limit: undefined,
      });
      expect(result).toEqual({
        success: true,
        count: 2,
        events,
      });
    });

    it('devrait transmettre tous les filtres au service', async () => {
      mockTrackingService.findEventsByOrganization.mockResolvedValue([events[0]]);
      const startDate = '2026-02-15T00:00:00Z';
      const endDate = '2026-02-15T23:59:59Z';

      await controller.getOrganizationEvents(
        orgId,
        mockUser,
        EventType.CLICK,
        startDate,
        endDate,
        '/dashboard',
        50,
      );

      expect(service.findEventsByOrganization).toHaveBeenCalledWith(orgId, {
        eventType: EventType.CLICK,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        pageUrl: '/dashboard',
        limit: 50,
      });
    });

    it('devrait filtrer par eventType uniquement', async () => {
      mockTrackingService.findEventsByOrganization.mockResolvedValue(events);

      await controller.getOrganizationEvents(orgId, mockUser, EventType.PAGE_VIEW);

      expect(service.findEventsByOrganization).toHaveBeenCalledWith(orgId, {
        eventType: EventType.PAGE_VIEW,
        startDate: undefined,
        endDate: undefined,
        pageUrl: undefined,
        limit: undefined,
      });
    });

    it('devrait retourner un tableau vide si aucun événement', async () => {
      mockTrackingService.findEventsByOrganization.mockResolvedValue([]);

      const result = await controller.getOrganizationEvents(orgId, mockUser);

      expect(result.count).toBe(0);
      expect(result.events).toEqual([]);
    });

    it('devrait convertir limit en entier', async () => {
      mockTrackingService.findEventsByOrganization.mockResolvedValue(events);

      await controller.getOrganizationEvents(
        orgId,
        mockUser,
        undefined,
        undefined,
        undefined,
        undefined,
        25,
      );

      expect(service.findEventsByOrganization).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          limit: 25,
        }),
      );
    });

    it('devrait propager une erreur du service', async () => {
      mockTrackingService.findEventsByOrganization.mockRejectedValue(
        new Error('Organisation introuvable'),
      );

      await expect(controller.getOrganizationEvents(orgId, mockUser)).rejects.toThrow(
        'Organisation introuvable',
      );
    });
  });
});

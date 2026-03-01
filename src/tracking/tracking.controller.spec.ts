import { Test, TestingModule } from '@nestjs/testing';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { TrackEventDto } from './dto/track-event.dto';
import { BatchTrackEventsDto } from './dto/batch-track-events.dto';
import { EventType } from './enums/tracking.enums';
import { BehaviorEvent } from './entities/behavior_event.entity';

describe('TrackingController', () => {
  let controller: TrackingController;
  let service: TrackingService;

  const mockTrackingService = {
    trackEvent: jest.fn(),
    trackBatch: jest.fn(),
    findEventsBySession: jest.fn(),
    analyzeSessionFrictions: jest.fn(),
    findEventsByOrganization: jest.fn(),
  };

  // ── helpers ──────────────────────────────────────────────────
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

  const makeTrackEventDto = (overrides: Partial<TrackEventDto> = {}): TrackEventDto => ({
    sessionId: 'sess-uuid-1',
    organizationId: 'org-uuid-1',
    eventType: EventType.CLICK,
    pageUrl: '/dashboard/transfers',
    elementSelector: '#transfer-button',
    elementText: 'Virement',
    timeOnPage: 30,
    ...overrides,
  });

  // ── setup ────────────────────────────────────────────────────
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackingController],
      providers: [
        {
          provide: TrackingService,
          useValue: mockTrackingService,
        },
      ],
    }).compile();

    controller = module.get<TrackingController>(TrackingController);
    service = module.get<TrackingService>(TrackingService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ════════════════════════════════════════════════════════════
  // POST /tracking/events
  // ════════════════════════════════════════════════════════════
  describe('trackEvent', () => {
    const dto = makeTrackEventDto();
    const savedEvent = makeMockEvent();

    it('devrait enregistrer un événement et retourner un résumé', async () => {
      mockTrackingService.trackEvent.mockResolvedValue(savedEvent);

      const result = await controller.trackEvent(dto);

      expect(service.trackEvent).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        success: true,
        message: 'Événement enregistré',
        event: {
          id: savedEvent.id,
          sessionId: savedEvent.sessionId,
          eventType: savedEvent.eventType,
          pageUrl: savedEvent.pageUrl,
          timestamp: savedEvent.timestamp,
        },
      });
    });

    it('devrait propager une erreur du service', async () => {
      mockTrackingService.trackEvent.mockRejectedValue(new Error('DB error'));

      await expect(controller.trackEvent(dto)).rejects.toThrow('DB error');
    });
  });

  // ════════════════════════════════════════════════════════════
  // POST /tracking/events/batch
  // ════════════════════════════════════════════════════════════
  describe('trackBatch', () => {
    const dto1 = makeTrackEventDto();
    const dto2 = makeTrackEventDto({
      eventType: EventType.PAGE_VIEW,
      pageUrl: '/dashboard',
    });
    const batchDto: BatchTrackEventsDto = { events: [dto1, dto2] };

    const savedEvents = [
      makeMockEvent({ id: 'evt-uuid-1' }),
      makeMockEvent({ id: 'evt-uuid-2', eventType: EventType.PAGE_VIEW, pageUrl: '/dashboard' }),
    ];

    it('devrait enregistrer un batch et retourner le résumé', async () => {
      mockTrackingService.trackBatch.mockResolvedValue(savedEvents);

      const result = await controller.trackBatch(batchDto);

      expect(service.trackBatch).toHaveBeenCalledWith(batchDto.events);
      expect(result).toEqual({
        success: true,
        message: 'Batch enregistré',
        count: 2,
        events: [
          { id: 'evt-uuid-1', eventType: EventType.CLICK, pageUrl: '/dashboard/transfers' },
          { id: 'evt-uuid-2', eventType: EventType.PAGE_VIEW, pageUrl: '/dashboard' },
        ],
      });
    });

    it('devrait retourner un batch vide si aucun événement', async () => {
      mockTrackingService.trackBatch.mockResolvedValue([]);

      const result = await controller.trackBatch({ events: [] });

      expect(result.count).toBe(0);
      expect(result.events).toEqual([]);
    });

    it('devrait propager une erreur du service', async () => {
      mockTrackingService.trackBatch.mockRejectedValue(new Error('Org not found'));

      await expect(controller.trackBatch(batchDto)).rejects.toThrow('Org not found');
    });
  });

  // ════════════════════════════════════════════════════════════
  // GET /tracking/sessions/:sessionId/events
  // ════════════════════════════════════════════════════════════
  describe('getSessionEvents', () => {
    const sessionId = 'sess-uuid-1';
    const events = [
      makeMockEvent({ id: 'evt-1' }),
      makeMockEvent({ id: 'evt-2', eventType: EventType.SCROLL }),
    ];

    it('devrait retourner les événements d\'une session', async () => {
      mockTrackingService.findEventsBySession.mockResolvedValue(events);

      const result = await controller.getSessionEvents(sessionId, 100);

      expect(service.findEventsBySession).toHaveBeenCalledWith(sessionId, 100);
      expect(result).toEqual({
        success: true,
        count: 2,
        events,
      });
    });

    it('devrait retourner un tableau vide si aucun événement', async () => {
      mockTrackingService.findEventsBySession.mockResolvedValue([]);

      const result = await controller.getSessionEvents(sessionId, 100);

      expect(result.count).toBe(0);
      expect(result.events).toEqual([]);
    });

    it('devrait transmettre la limite personnalisée', async () => {
      mockTrackingService.findEventsBySession.mockResolvedValue([events[0]]);

      await controller.getSessionEvents(sessionId, 1);

      expect(service.findEventsBySession).toHaveBeenCalledWith(sessionId, 1);
    });
  });

  // ════════════════════════════════════════════════════════════
  // GET /tracking/sessions/:sessionId/frictions
  // ════════════════════════════════════════════════════════════
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

      const result = await controller.analyzeSessionFrictions(sessionId);

      expect(service.analyzeSessionFrictions).toHaveBeenCalledWith(sessionId);
      expect(result).toEqual({
        success: true,
        sessionId,
        frictions,
        riskLevel: 'NONE',
      });
    });

    it('devrait retourner LOW pour 2-4 frictions', async () => {
      const frictions = { clickMisses: 2, scrollHesitations: 0, excessiveTimeOnPage: 0, formAbandonments: 0, navigationBacks: 0 };
      mockTrackingService.analyzeSessionFrictions.mockResolvedValue(frictions);

      const result = await controller.analyzeSessionFrictions(sessionId);
      expect(result.riskLevel).toBe('LOW');
    });

    it('devrait retourner MEDIUM pour 5-9 frictions', async () => {
      const frictions = { clickMisses: 3, scrollHesitations: 2, excessiveTimeOnPage: 0, formAbandonments: 0, navigationBacks: 0 };
      mockTrackingService.analyzeSessionFrictions.mockResolvedValue(frictions);

      const result = await controller.analyzeSessionFrictions(sessionId);
      expect(result.riskLevel).toBe('MEDIUM');
    });

    it('devrait retourner HIGH pour 10+ frictions', async () => {
      const frictions = { clickMisses: 5, scrollHesitations: 3, excessiveTimeOnPage: 2, formAbandonments: 0, navigationBacks: 0 };
      mockTrackingService.analyzeSessionFrictions.mockResolvedValue(frictions);

      const result = await controller.analyzeSessionFrictions(sessionId);
      expect(result.riskLevel).toBe('HIGH');
    });
  });

  // ════════════════════════════════════════════════════════════
  // GET /tracking/organizations/:organizationId/events
  // ════════════════════════════════════════════════════════════
  describe('getOrganizationEvents', () => {
    const orgId = 'org-uuid-1';
    const events = [makeMockEvent(), makeMockEvent({ id: 'evt-uuid-2' })];

    it('devrait retourner les événements d\'une organisation sans filtres', async () => {
      mockTrackingService.findEventsByOrganization.mockResolvedValue(events);

      const result = await controller.getOrganizationEvents(orgId);

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

    it('devrait transmettre les filtres au service', async () => {
      mockTrackingService.findEventsByOrganization.mockResolvedValue([events[0]]);
      const startDate = '2026-02-15T00:00:00Z';
      const endDate = '2026-02-15T23:59:59Z';

      await controller.getOrganizationEvents(
        orgId,
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

    it('devrait retourner un tableau vide si aucun événement', async () => {
      mockTrackingService.findEventsByOrganization.mockResolvedValue([]);

      const result = await controller.getOrganizationEvents(orgId);

      expect(result.count).toBe(0);
      expect(result.events).toEqual([]);
    });
  });
});

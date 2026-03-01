import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { BehaviorEvent } from './entities/behavior_event.entity';
import { REDIS_CLIENT } from '../redis/redis.module';
import { OrganizationService } from '../organization/organization.service';
import { EventType } from './enums/tracking.enums';
import { TrackEventDto } from './dto/track-event.dto';

describe('TrackingService', () => {
  let service: TrackingService;
  let repo: Repository<BehaviorEvent>;
  let redis: Record<string, jest.Mock>;
  let organizationService: { findById: jest.Mock };

  // ── mock Redis client ──────────────────────────────────────
  const mockRedis = {
    get: jest.fn(),
    setex: jest.fn(),
  };

  // ── mock OrganizationService ───────────────────────────────
  const mockOrgService = {
    findById: jest.fn(),
  };

  // ── mock repository ────────────────────────────────────────
  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  // ── helpers ────────────────────────────────────────────────
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

  const makeDto = (overrides: Partial<TrackEventDto> = {}): TrackEventDto => ({
    sessionId: 'sess-uuid-1',
    organizationId: 'org-uuid-1',
    eventType: EventType.CLICK,
    pageUrl: '/dashboard/transfers',
    elementSelector: '#transfer-button',
    ...overrides,
  });

  // ── setup ──────────────────────────────────────────────────
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingService,
        { provide: getRepositoryToken(BehaviorEvent), useValue: mockRepository },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: OrganizationService, useValue: mockOrgService },
      ],
    }).compile();

    service = module.get<TrackingService>(TrackingService);
    repo = module.get<Repository<BehaviorEvent>>(getRepositoryToken(BehaviorEvent));
    redis = mockRedis;
    organizationService = mockOrgService;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ════════════════════════════════════════════════════════════
  // trackEvent
  // ════════════════════════════════════════════════════════════
  describe('trackEvent', () => {
    const dto = makeDto();
    const createdEvent = makeMockEvent();

    beforeEach(() => {
      mockOrgService.findById.mockResolvedValue({ id: dto.organizationId });
      mockRepository.create.mockReturnValue(createdEvent);
      mockRepository.save.mockResolvedValue(createdEvent);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
    });

    it('devrait valider l\'organisation, créer et sauvegarder l\'événement', async () => {
      const result = await service.trackEvent(dto);

      expect(organizationService.findById).toHaveBeenCalledWith(dto.organizationId);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        ...dto,
        timestamp: expect.any(Date),
      }));
      expect(repo.save).toHaveBeenCalledWith(createdEvent);
      expect(result).toEqual(createdEvent);
    });

    it('devrait mettre à jour le cache Redis pour la session', async () => {
      await service.trackEvent(dto);

      expect(redis.get).toHaveBeenCalledWith(`session:${dto.sessionId}`);
      expect(redis.setex).toHaveBeenCalledWith(
        `session:${dto.sessionId}`,
        86400,
        expect.any(String),
      );
    });

    it('devrait initialiser la session en cache si elle n\'existe pas', async () => {
      mockRedis.get.mockResolvedValue(null);

      await service.trackEvent(dto);

      const cachedJson = mockRedis.setex.mock.calls[0][2];
      const cached = JSON.parse(cachedJson);
      expect(cached.sessionId).toBe(dto.sessionId);
      expect(cached.eventCount).toBe(1);
    });

    it('devrait incrémenter le compteur de session existante', async () => {
      const existingSession = {
        sessionId: dto.sessionId,
        organizationId: dto.organizationId,
        userId: null,
        firstEventAt: '2026-02-15T09:00:00.000Z',
        lastEventAt: '2026-02-15T09:30:00.000Z',
        eventCount: 5,
        pageViews: ['/dashboard'],
        totalTimeOnPage: 120,
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(existingSession));

      await service.trackEvent(dto);

      const cachedJson = mockRedis.setex.mock.calls[0][2];
      const cached = JSON.parse(cachedJson);
      expect(cached.eventCount).toBe(6);
    });

    it('devrait ajouter la pageUrl dans pageViews pour un PAGE_VIEW', async () => {
      const pvDto = makeDto({ eventType: EventType.PAGE_VIEW, pageUrl: '/new-page' });
      mockRedis.get.mockResolvedValue(null);

      await service.trackEvent(pvDto);

      const cachedJson = mockRedis.setex.mock.calls[0][2];
      const cached = JSON.parse(cachedJson);
      expect(cached.pageViews).toContain('/new-page');
    });

    it('devrait propager l\'erreur si l\'organisation n\'existe pas', async () => {
      mockOrgService.findById.mockRejectedValue(new NotFoundException('Organisation introuvable'));

      await expect(service.trackEvent(dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ════════════════════════════════════════════════════════════
  // trackBatch
  // ════════════════════════════════════════════════════════════
  describe('trackBatch', () => {
    const dto1 = makeDto();
    const dto2 = makeDto({
      organizationId: 'org-uuid-2',
      eventType: EventType.PAGE_VIEW,
      pageUrl: '/about',
    });
    const events = [makeMockEvent({ id: 'evt-1' }), makeMockEvent({ id: 'evt-2' })];

    beforeEach(() => {
      mockOrgService.findById.mockResolvedValue({ id: 'org' });
      mockRepository.create.mockImplementation((dto) => ({ ...dto, id: 'generated' }));
      mockRepository.save.mockResolvedValue(events);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
    });

    it('devrait valider toutes les organisations uniques', async () => {
      await service.trackBatch([dto1, dto2]);

      expect(organizationService.findById).toHaveBeenCalledTimes(2);
      expect(organizationService.findById).toHaveBeenCalledWith('org-uuid-1');
      expect(organizationService.findById).toHaveBeenCalledWith('org-uuid-2');
    });

    it('devrait ne valider qu\'une fois une organisation dupliquée', async () => {
      await service.trackBatch([dto1, makeDto()]);

      expect(organizationService.findById).toHaveBeenCalledTimes(1);
    });

    it('devrait créer et sauvegarder tous les événements en batch', async () => {
      await service.trackBatch([dto1, dto2]);

      expect(repo.create).toHaveBeenCalledTimes(2);
      expect(repo.save).toHaveBeenCalledTimes(1); // batch save
    });

    it('devrait mettre à jour le cache Redis pour chaque événement', async () => {
      await service.trackBatch([dto1, dto2]);

      expect(redis.setex).toHaveBeenCalledTimes(2);
    });

    it('devrait propager l\'erreur si une organisation est invalide', async () => {
      mockOrgService.findById.mockRejectedValue(new NotFoundException('Org introuvable'));

      await expect(service.trackBatch([dto1])).rejects.toThrow(NotFoundException);
    });
  });

  // ════════════════════════════════════════════════════════════
  // getSessionData
  // ════════════════════════════════════════════════════════════
  describe('getSessionData', () => {
    it('devrait retourner les données en cache', async () => {
      const sessionData = { sessionId: 'sess-1', eventCount: 5, pageViews: ['/a'] };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));

      const result = await service.getSessionData('sess-1');

      expect(redis.get).toHaveBeenCalledWith('session:sess-1');
      expect(result).toEqual(sessionData);
    });

    it('devrait retourner null si la session n\'est pas en cache', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getSessionData('unknown');

      expect(result).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════
  // findEventsByUser
  // ════════════════════════════════════════════════════════════
  describe('findEventsByUser', () => {
    it('devrait retourner les événements triés par timestamp DESC', async () => {
      const events = [makeMockEvent()];
      mockRepository.find.mockResolvedValue(events);

      const result = await service.findEventsByUser('usr-uuid-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'usr-uuid-1' },
        order: { timestamp: 'DESC' },
        take: 100,
      });
      expect(result).toEqual(events);
    });

    it('devrait respecter la limite personnalisée', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.findEventsByUser('usr-uuid-1', 10);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  // ════════════════════════════════════════════════════════════
  // findEventsBySession
  // ════════════════════════════════════════════════════════════
  describe('findEventsBySession', () => {
    it('devrait retourner les événements d\'une session', async () => {
      const events = [makeMockEvent(), makeMockEvent({ id: 'evt-2' })];
      mockRepository.find.mockResolvedValue(events);

      const result = await service.findEventsBySession('sess-uuid-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { sessionId: 'sess-uuid-1' },
        order: { timestamp: 'DESC' },
        take: 100,
      });
      expect(result).toHaveLength(2);
    });

    it('devrait retourner un tableau vide si aucun événement', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findEventsBySession('nonexistent');

      expect(result).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════
  // findEventsByOrganization (QueryBuilder)
  // ════════════════════════════════════════════════════════════
  describe('findEventsByOrganization', () => {
    let mockQb: Record<string, jest.Mock>;

    beforeEach(() => {
      mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQb);
    });

    it('devrait créer un QueryBuilder avec le filtre organization', async () => {
      await service.findEventsByOrganization('org-uuid-1', {});

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('event');
      expect(mockQb.where).toHaveBeenCalledWith(
        'event.organizationId = :organizationId',
        { organizationId: 'org-uuid-1' },
      );
      expect(mockQb.orderBy).toHaveBeenCalledWith('event.timestamp', 'DESC');
      expect(mockQb.getMany).toHaveBeenCalled();
    });

    it('devrait appliquer le filtre eventType', async () => {
      await service.findEventsByOrganization('org-uuid-1', {
        eventType: EventType.CLICK,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'event.eventType = :eventType',
        { eventType: EventType.CLICK },
      );
    });

    it('devrait appliquer le filtre startDate', async () => {
      const startDate = new Date('2026-02-15T00:00:00Z');
      await service.findEventsByOrganization('org-uuid-1', { startDate });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'event.timestamp >= :startDate',
        { startDate },
      );
    });

    it('devrait appliquer le filtre endDate', async () => {
      const endDate = new Date('2026-02-15T23:59:59Z');
      await service.findEventsByOrganization('org-uuid-1', { endDate });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'event.timestamp <= :endDate',
        { endDate },
      );
    });

    it('devrait appliquer le filtre pageUrl avec LIKE', async () => {
      await service.findEventsByOrganization('org-uuid-1', { pageUrl: '/dashboard' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'event.pageUrl LIKE :pageUrl',
        { pageUrl: '%/dashboard%' },
      );
    });

    it('devrait appliquer la limite', async () => {
      await service.findEventsByOrganization('org-uuid-1', { limit: 50 });

      expect(mockQb.limit).toHaveBeenCalledWith(50);
    });

    it('devrait combiner plusieurs filtres', async () => {
      const startDate = new Date('2026-02-01T00:00:00Z');
      const endDate = new Date('2026-02-28T23:59:59Z');

      await service.findEventsByOrganization('org-uuid-1', {
        eventType: EventType.PAGE_VIEW,
        startDate,
        endDate,
        pageUrl: '/transfers',
        limit: 25,
      });

      expect(mockQb.andWhere).toHaveBeenCalledTimes(4);
      expect(mockQb.limit).toHaveBeenCalledWith(25);
    });

    it('ne devrait appliquer aucun filtre supplémentaire si non fournis', async () => {
      await service.findEventsByOrganization('org-uuid-1', {});

      expect(mockQb.andWhere).not.toHaveBeenCalled();
      expect(mockQb.limit).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════
  // analyzeSessionFrictions
  // ════════════════════════════════════════════════════════════
  describe('analyzeSessionFrictions', () => {
    it('devrait retourner zéro frictions pour une session vide', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.analyzeSessionFrictions('sess-uuid-1');

      expect(result).toEqual({
        clickMisses: 0,
        scrollHesitations: 0,
        excessiveTimeOnPage: 0,
        formAbandonments: 0,
        navigationBacks: 0,
      });
    });

    it('devrait détecter un clic manqué (CLICK suivi de HOVER < 2s)', async () => {
      const events = [
        makeMockEvent({
          eventType: EventType.CLICK,
          timestamp: new Date('2026-02-15T10:00:00.000Z'),
        }),
        makeMockEvent({
          eventType: EventType.HOVER,
          timestamp: new Date('2026-02-15T10:00:01.000Z'), // 1s later < 2s
        }),
      ];
      mockRepository.find.mockResolvedValue(events);

      const result = await service.analyzeSessionFrictions('sess-uuid-1');

      expect(result.clickMisses).toBe(1);
    });

    it('ne devrait PAS détecter un clic manqué si délai >= 2s', async () => {
      const events = [
        makeMockEvent({
          eventType: EventType.CLICK,
          timestamp: new Date('2026-02-15T10:00:00.000Z'),
        }),
        makeMockEvent({
          eventType: EventType.HOVER,
          timestamp: new Date('2026-02-15T10:00:03.000Z'), // 3s > 2s
        }),
      ];
      mockRepository.find.mockResolvedValue(events);

      const result = await service.analyzeSessionFrictions('sess-uuid-1');

      expect(result.clickMisses).toBe(0);
    });

    it('devrait détecter une hésitation de scroll (pause > 5s entre scrolls)', async () => {
      const events = [
        makeMockEvent({
          eventType: EventType.SCROLL,
          timestamp: new Date('2026-02-15T10:00:00.000Z'),
        }),
        makeMockEvent({
          eventType: EventType.SCROLL,
          timestamp: new Date('2026-02-15T10:00:06.000Z'), // 6s > 5s
        }),
      ];
      mockRepository.find.mockResolvedValue(events);

      const result = await service.analyzeSessionFrictions('sess-uuid-1');

      expect(result.scrollHesitations).toBe(1);
    });

    it('ne devrait PAS détecter d\'hésitation de scroll si pause <= 5s', async () => {
      const events = [
        makeMockEvent({
          eventType: EventType.SCROLL,
          timestamp: new Date('2026-02-15T10:00:00.000Z'),
        }),
        makeMockEvent({
          eventType: EventType.SCROLL,
          timestamp: new Date('2026-02-15T10:00:04.000Z'), // 4s <= 5s
        }),
      ];
      mockRepository.find.mockResolvedValue(events);

      const result = await service.analyzeSessionFrictions('sess-uuid-1');

      expect(result.scrollHesitations).toBe(0);
    });

    it('devrait détecter un temps excessif sur page (timeOnPage > 120s)', async () => {
      const events = [
        makeMockEvent({
          eventType: EventType.PAGE_VIEW,
          timeOnPage: 150, // > 120
        }),
      ];
      mockRepository.find.mockResolvedValue(events);

      const result = await service.analyzeSessionFrictions('sess-uuid-1');

      expect(result.excessiveTimeOnPage).toBe(1);
    });

    it('ne devrait PAS détecter un temps excessif si timeOnPage <= 120s', async () => {
      const events = [
        makeMockEvent({
          eventType: EventType.PAGE_VIEW,
          timeOnPage: 60, // <= 120
        }),
      ];
      mockRepository.find.mockResolvedValue(events);

      const result = await service.analyzeSessionFrictions('sess-uuid-1');

      expect(result.excessiveTimeOnPage).toBe(0);
    });

    it('devrait détecter plusieurs frictions dans une même session', async () => {
      const events = [
        // Click miss
        makeMockEvent({
          eventType: EventType.CLICK,
          timestamp: new Date('2026-02-15T10:00:00.000Z'),
        }),
        makeMockEvent({
          eventType: EventType.HOVER,
          timestamp: new Date('2026-02-15T10:00:01.000Z'),
        }),
        // Scroll hesitation
        makeMockEvent({
          eventType: EventType.SCROLL,
          timestamp: new Date('2026-02-15T10:00:10.000Z'),
        }),
        makeMockEvent({
          eventType: EventType.SCROLL,
          timestamp: new Date('2026-02-15T10:00:20.000Z'), // 10s gap
        }),
        // Excessive time
        makeMockEvent({
          eventType: EventType.PAGE_VIEW,
          timeOnPage: 200,
          timestamp: new Date('2026-02-15T10:01:00.000Z'),
        }),
      ];
      mockRepository.find.mockResolvedValue(events);

      const result = await service.analyzeSessionFrictions('sess-uuid-1');

      expect(result.clickMisses).toBe(1);
      expect(result.scrollHesitations).toBe(1);
      expect(result.excessiveTimeOnPage).toBe(1);
    });

    it('devrait appeler findEventsBySession avec limit 1000', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.analyzeSessionFrictions('sess-uuid-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { sessionId: 'sess-uuid-1' },
        order: { timestamp: 'DESC' },
        take: 1000,
      });
    });
  });
});

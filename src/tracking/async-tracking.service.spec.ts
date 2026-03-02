import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsyncTrackingService } from './async-tracking.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { BehaviorEvent } from './entities/behavior_event.entity';
import { EventType } from './enums/tracking.enums';
import { TrackEventDto } from './dto/track-event.dto';

describe('AsyncTrackingService', () => {
  let service: AsyncTrackingService;
  let rabbitMQService: RabbitMQService;
  let repo: Repository<BehaviorEvent>;

  // ── mock RabbitMQ ──────────────────────────────────────────
  const mockRabbitMQService = {
    publish: jest.fn(),
    consume: jest.fn(),
    close: jest.fn(),
  };

  // ── mock repository ────────────────────────────────────────
  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
  };

  // ── helpers ────────────────────────────────────────────────
  const makeDto = (overrides: Partial<TrackEventDto> = {}): TrackEventDto => ({
    sessionId: 'sess-uuid-1',
    organizationId: 'org-uuid-1',
    eventType: EventType.CLICK,
    pageUrl: '/dashboard/transfers',
    elementSelector: '#transfer-button',
    ...overrides,
  });

  const makeMockEvent = (overrides: Partial<BehaviorEvent> = {}): BehaviorEvent =>
    ({
      id: 'evt-uuid-1',
      sessionId: 'sess-uuid-1',
      organizationId: 'org-uuid-1',
      eventType: EventType.CLICK,
      pageUrl: '/dashboard/transfers',
      elementSelector: '#transfer-button',
      metadata: {},
      timestamp: new Date('2026-02-15T10:30:00.000Z'),
      ...overrides,
    }) as BehaviorEvent;

  // ── setup ──────────────────────────────────────────────────
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsyncTrackingService,
        { provide: RabbitMQService, useValue: mockRabbitMQService },
        { provide: getRepositoryToken(BehaviorEvent), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<AsyncTrackingService>(AsyncTrackingService);
    rabbitMQService = module.get<RabbitMQService>(RabbitMQService);
    repo = module.get<Repository<BehaviorEvent>>(getRepositoryToken(BehaviorEvent));
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ════════════════════════════════════════════════════════════
  // onModuleInit / startConsuming
  // ════════════════════════════════════════════════════════════
  describe('onModuleInit / startConsuming', () => {
    it('devrait appeler consume de RabbitMQ au démarrage', async () => {
      mockRabbitMQService.consume.mockResolvedValue(undefined);
      await service.onModuleInit();
      expect(rabbitMQService.consume).toHaveBeenCalledTimes(1);
      expect(rabbitMQService.consume).toHaveBeenCalledWith(expect.any(Function));
    });

    it('devrait ne pas crash si consume échoue', async () => {
      mockRabbitMQService.consume.mockRejectedValue(new Error('Channel not ready'));
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('devrait passer processEventFromQueue comme callback', async () => {
      mockRabbitMQService.consume.mockImplementation(async (cb: Function) => {
        const eventData = { sessionId: 'sess-1', organizationId: 'org-1', eventType: 'CLICK', pageUrl: '/test' };
        const savedEvent = makeMockEvent();
        mockRepository.create.mockReturnValue(savedEvent);
        mockRepository.save.mockResolvedValue(savedEvent);
        await cb(eventData);
      });

      await service.startConsuming();
      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  // ════════════════════════════════════════════════════════════
  // trackEventAsync
  // ════════════════════════════════════════════════════════════
  describe('trackEventAsync', () => {
    const dto = makeDto();

    it('devrait publier l\'événement dans RabbitMQ et retourner accepted: true', async () => {
      mockRabbitMQService.publish.mockResolvedValue(true);

      const result = await service.trackEventAsync(dto);

      expect(rabbitMQService.publish).toHaveBeenCalledTimes(1);
      expect(rabbitMQService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: dto.sessionId,
          organizationId: dto.organizationId,
          eventType: dto.eventType,
          pageUrl: dto.pageUrl,
          retryCount: 0,
        }),
      );
      expect(result).toEqual({ accepted: true });
    });

    it('devrait retourner accepted: false si RabbitMQ refuse (buffer plein)', async () => {
      mockRabbitMQService.publish.mockResolvedValue(false);

      const result = await service.trackEventAsync(dto);

      expect(result).toEqual({ accepted: false });
    });

    it('devrait retourner accepted: false en cas d\'erreur RabbitMQ', async () => {
      mockRabbitMQService.publish.mockRejectedValue(new Error('Connection lost'));

      const result = await service.trackEventAsync(dto);

      expect(result).toEqual({ accepted: false });
    });

    it('devrait inclure un timestamp dans le message publié', async () => {
      mockRabbitMQService.publish.mockResolvedValue(true);

      await service.trackEventAsync(dto);

      const publishedData = mockRabbitMQService.publish.mock.calls[0][0];
      expect(publishedData.timestamp).toBeInstanceOf(Date);
    });
  });

  // ════════════════════════════════════════════════════════════
  // trackBatchAsync
  // ════════════════════════════════════════════════════════════
  describe('trackBatchAsync', () => {
    const dto1 = makeDto();
    const dto2 = makeDto({ eventType: EventType.PAGE_VIEW, pageUrl: '/dashboard' });
    const batch = [dto1, dto2];

    it('devrait publier chaque événement et retourner le compte total', async () => {
      mockRabbitMQService.publish.mockResolvedValue(true);

      const result = await service.trackBatchAsync(batch);

      expect(rabbitMQService.publish).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ accepted: true, count: 2 });
    });

    it('devrait compter les succès partiels', async () => {
      mockRabbitMQService.publish
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await service.trackBatchAsync(batch);

      expect(result).toEqual({ accepted: true, count: 1 });
    });

    it('devrait retourner accepted: false si aucun événement n\'est publié', async () => {
      mockRabbitMQService.publish.mockResolvedValue(false);

      const result = await service.trackBatchAsync(batch);

      expect(result).toEqual({ accepted: false, count: 0 });
    });

    it('devrait gérer un batch vide', async () => {
      const result = await service.trackBatchAsync([]);

      expect(rabbitMQService.publish).not.toHaveBeenCalled();
      expect(result).toEqual({ accepted: false, count: 0 });
    });

    it('devrait retourner count: 0 en cas d\'erreur globale', async () => {
      mockRabbitMQService.publish.mockRejectedValue(new Error('Fatal'));

      const result = await service.trackBatchAsync(batch);

      expect(result).toEqual({ accepted: false, count: 0 });
    });
  });

  // ════════════════════════════════════════════════════════════
  // processEventFromQueue
  // ════════════════════════════════════════════════════════════
  describe('processEventFromQueue', () => {
    const validEventData = {
      sessionId: 'sess-uuid-1',
      organizationId: 'org-uuid-1',
      eventType: EventType.CLICK,
      pageUrl: '/dashboard',
      timestamp: '2026-02-15T10:30:00.000Z',
      retryCount: 0,
    };

    it('devrait sauvegarder un événement valide dans la base', async () => {
      const savedEvent = makeMockEvent();
      mockRepository.create.mockReturnValue(savedEvent);
      mockRepository.save.mockResolvedValue(savedEvent);

      await service.processEventFromQueue(validEventData);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(savedEvent);
    });

    it('devrait ignorer les données invalides (sessionId manquant)', async () => {
      const invalidData = { organizationId: 'org-uuid-1', eventType: EventType.CLICK };

      await service.processEventFromQueue(invalidData);

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('devrait ignorer les données invalides (organizationId manquant)', async () => {
      const invalidData = { sessionId: 'sess-uuid-1', eventType: EventType.CLICK };

      await service.processEventFromQueue(invalidData);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('devrait ignorer les données invalides (eventType manquant)', async () => {
      const invalidData = { sessionId: 'sess-uuid-1', organizationId: 'org-uuid-1' };

      await service.processEventFromQueue(invalidData);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('devrait requeuer l\'événement en cas d\'erreur de sauvegarde (retry < max)', async () => {
      mockRepository.create.mockReturnValue(makeMockEvent());
      mockRepository.save.mockRejectedValue(new Error('DB unavailable'));
      mockRabbitMQService.publish.mockResolvedValue(true);

      await service.processEventFromQueue({ ...validEventData, retryCount: 0 });

      expect(rabbitMQService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          retryCount: 1,
          sessionId: validEventData.sessionId,
        }),
      );
    }, 10000);

    it('devrait sauvegarder en failed_events après maxRetries atteint', async () => {
      mockRepository.create.mockReturnValue(makeMockEvent());
      mockRepository.save.mockRejectedValue(new Error('DB unavailable'));
      mockRepository.query.mockResolvedValue(undefined);

      await service.processEventFromQueue({ ...validEventData, retryCount: 3 });

      // Ne devrait PAS requeuer
      expect(rabbitMQService.publish).not.toHaveBeenCalled();
      // Devrait sauvegarder dans failed_events (2 appels query : CREATE TABLE + INSERT)
      expect(repo.query).toHaveBeenCalledTimes(2);
    });
  });
});

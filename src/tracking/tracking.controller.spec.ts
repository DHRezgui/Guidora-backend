import { Test, TestingModule } from '@nestjs/testing';
import { TrackingController } from './tracking.controller';
import { AsyncTrackingService } from './async-tracking.service';
import { TrackEventDto } from './dto/track-event.dto';
import { BatchTrackEventsDto } from './dto/batch-track-events.dto';
import { EventType } from './enums/tracking.enums';

describe('TrackingController', () => {
  let controller: TrackingController;
  let asyncService: AsyncTrackingService;

  const mockAsyncTrackingService = {
    trackEventAsync: jest.fn(),
    trackBatchAsync: jest.fn(),
  };

  // ── helpers ──────────────────────────────────────────────────
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
          provide: AsyncTrackingService,
          useValue: mockAsyncTrackingService,
        },
      ],
    }).compile();

    controller = module.get<TrackingController>(TrackingController);
    asyncService = module.get<AsyncTrackingService>(AsyncTrackingService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ════════════════════════════════════════════════════════════
  // POST /tracking/events  (asynchrone – 202 Accepted)
  // ════════════════════════════════════════════════════════════
  describe('trackEvent', () => {
    const dto = makeTrackEventDto();

    it('devrait accepter un événement et retourner accepted: true', async () => {
      mockAsyncTrackingService.trackEventAsync.mockResolvedValue({ accepted: true });

      const result = await controller.trackEvent(dto);

      expect(asyncService.trackEventAsync).toHaveBeenCalledWith(dto);
      expect(asyncService.trackEventAsync).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        success: true,
        message: 'Événement accepté',
        accepted: true,
      });
    });

    it('devrait retourner accepted: false si le buffer est plein', async () => {
      mockAsyncTrackingService.trackEventAsync.mockResolvedValue({ accepted: false });

      const result = await controller.trackEvent(dto);

      expect(result).toEqual({
        success: false,
        message: 'Événement rejeté (buffer plein)',
        accepted: false,
      });
    });

    it('devrait propager une erreur du service', async () => {
      mockAsyncTrackingService.trackEventAsync.mockRejectedValue(
        new Error('RabbitMQ connection failed'),
      );

      await expect(controller.trackEvent(dto)).rejects.toThrow('RabbitMQ connection failed');
    });

    it('devrait transmettre le DTO complet au service', async () => {
      const fullDto = makeTrackEventDto({
        userId: 'usr-uuid-1',
        scrollDepth: 75,
        metadata: { viewportWidth: 1920 },
      });
      mockAsyncTrackingService.trackEventAsync.mockResolvedValue({ accepted: true });

      await controller.trackEvent(fullDto);

      expect(asyncService.trackEventAsync).toHaveBeenCalledWith(fullDto);
    });
  });

  // ════════════════════════════════════════════════════════════
  // POST /tracking/events/batch  (asynchrone – 202 Accepted)
  // ════════════════════════════════════════════════════════════
  describe('trackBatch', () => {
    const dto1 = makeTrackEventDto();
    const dto2 = makeTrackEventDto({
      eventType: EventType.PAGE_VIEW,
      pageUrl: '/dashboard',
    });
    const batchDto: BatchTrackEventsDto = { events: [dto1, dto2] };

    it('devrait accepter un batch et retourner le résumé', async () => {
      mockAsyncTrackingService.trackBatchAsync.mockResolvedValue({
        accepted: true,
        count: 2,
      });

      const result = await controller.trackBatch(batchDto);

      expect(asyncService.trackBatchAsync).toHaveBeenCalledWith(batchDto.events);
      expect(asyncService.trackBatchAsync).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        success: true,
        message: 'Batch accepté (2/2 événements)',
        accepted: true,
        count: 2,
      });
    });

    it('devrait retourner accepted: false si le buffer est plein', async () => {
      mockAsyncTrackingService.trackBatchAsync.mockResolvedValue({
        accepted: false,
        count: 0,
      });

      const result = await controller.trackBatch(batchDto);

      expect(result).toEqual({
        success: false,
        message: 'Batch rejeté (buffer plein)',
        accepted: false,
        count: 0,
      });
    });

    it('devrait indiquer un succès partiel quand certains événements échouent', async () => {
      const largeBatch: BatchTrackEventsDto = {
        events: [dto1, dto2, makeTrackEventDto({ pageUrl: '/settings' })],
      };
      mockAsyncTrackingService.trackBatchAsync.mockResolvedValue({
        accepted: true,
        count: 2,
      });

      const result = await controller.trackBatch(largeBatch);

      expect(result).toEqual({
        success: true,
        message: 'Batch accepté (2/3 événements)',
        accepted: true,
        count: 2,
      });
    });

    it('devrait gérer un batch vide', async () => {
      const emptyBatch: BatchTrackEventsDto = { events: [] };
      mockAsyncTrackingService.trackBatchAsync.mockResolvedValue({
        accepted: false,
        count: 0,
      });

      const result = await controller.trackBatch(emptyBatch);

      expect(result.accepted).toBe(false);
      expect(result.count).toBe(0);
    });

    it('devrait propager une erreur du service', async () => {
      mockAsyncTrackingService.trackBatchAsync.mockRejectedValue(
        new Error('RabbitMQ unavailable'),
      );

      await expect(controller.trackBatch(batchDto)).rejects.toThrow('RabbitMQ unavailable');
    });
  });
});

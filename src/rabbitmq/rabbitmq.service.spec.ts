import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';

// Mock amqplib — use __esModule + getter so the mock factory doesn't
// reference variables before they are initialised (jest.mock is hoisted).
const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue(undefined),
  assertQueue: jest.fn().mockResolvedValue({ queue: 'tracking_events' }),
  bindQueue: jest.fn().mockResolvedValue(undefined),
  sendToQueue: jest.fn().mockReturnValue(true),
  consume: jest.fn().mockResolvedValue({ consumerTag: 'tag-1' }),
  ack: jest.fn(),
  nack: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('amqplib', () => {
  // This factory runs lazily — after mockConnection is defined
  return {
    __esModule: true,
    connect: jest.fn(),
  };
});

describe('RabbitMQService', () => {
  let service: RabbitMQService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        RABBITMQ_USER: 'guest',
        RABBITMQ_PASSWORD: 'guest',
        RABBITMQ_HOST: 'localhost',
        RABBITMQ_PORT: '5672',
        RABBITMQ_QUEUE: 'tracking_events',
        RABBITMQ_EXCHANGE: 'tracking_exchange',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Configure the amqplib mock to return our mockConnection
    const amqp = require('amqplib');
    amqp.connect.mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
  });

  afterEach(async () => {
    // Reset internal state
    try { await service.close(); } catch { /* ignore */ }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('devrait initialiser les noms de queue et exchange depuis la config', () => {
    expect(mockConfigService.get).toHaveBeenCalledWith('RABBITMQ_QUEUE');
    expect(mockConfigService.get).toHaveBeenCalledWith('RABBITMQ_EXCHANGE');
  });

  describe('onModuleInit / connect', () => {
    it('devrait se connecter à RabbitMQ au démarrage', async () => {
      const amqp = require('amqplib');
      await service.onModuleInit();
      expect(amqp.connect).toHaveBeenCalledWith('amqp://guest:guest@localhost:5672');
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('devrait déclarer exchange, queue et binding', async () => {
      await service.onModuleInit();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith('tracking_exchange', 'direct', { durable: true });
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('tracking_events', { durable: true });
      expect(mockChannel.bindQueue).toHaveBeenCalledWith('tracking_events', 'tracking_exchange', '');
    });

    it('devrait écouter les événements de déconnexion', async () => {
      await service.onModuleInit();
      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('devrait reporter isConnected() = true après connexion', async () => {
      await service.onModuleInit();
      expect(service.isConnected()).toBe(true);
    });

    it('devrait propager l\'erreur si la connexion échoue', async () => {
      const amqp = require('amqplib');
      amqp.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.onModuleInit()).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('publish', () => {
    it('devrait publier un message dans la queue', async () => {
      await service.onModuleInit();
      const event = { sessionId: 'sess-1', eventType: 'CLICK' };
      const result = await service.publish(event);
      expect(result).toBe(true);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'tracking_events',
        expect.any(Buffer),
        { persistent: true },
      );
    });

    it('devrait retourner false si le buffer est plein', async () => {
      await service.onModuleInit();
      mockChannel.sendToQueue.mockReturnValueOnce(false);
      const result = await service.publish({ sessionId: 'sess-1' });
      expect(result).toBe(false);
    });

    it('devrait retourner false si le canal est null (déconnecté)', async () => {
      // Pas de onModuleInit() → channel est null
      const result = await service.publish({ sessionId: 'sess-1' });
      expect(result).toBe(false);
    });

    it('devrait retourner false en cas d\'erreur sendToQueue', async () => {
      await service.onModuleInit();
      mockChannel.sendToQueue.mockImplementationOnce(() => { throw new Error('Channel closed'); });
      const result = await service.publish({ sessionId: 'sess-1' });
      expect(result).toBe(false);
    });

    it('devrait sérialiser l\'événement en JSON', async () => {
      await service.onModuleInit();
      const event = { sessionId: 'sess-1', eventType: 'CLICK', metadata: { key: 'value' } };
      await service.publish(event);
      const sentBuffer = mockChannel.sendToQueue.mock.calls[0][1];
      expect(JSON.parse(sentBuffer.toString())).toEqual(event);
    });
  });

  describe('consume', () => {
    it('devrait enregistrer un consumer sur la queue', async () => {
      await service.onModuleInit();
      const callback = jest.fn();
      await service.consume(callback);
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'tracking_events',
        expect.any(Function),
        { noAck: false },
      );
    });

    it('devrait appeler le callback, parser le JSON et ack le message', async () => {
      await service.onModuleInit();
      const callback = jest.fn().mockResolvedValue(undefined);

      // Capturer le handler interne
      mockChannel.consume.mockImplementationOnce(async (_queue, handler, _opts) => {
        const msg = { content: Buffer.from(JSON.stringify({ sessionId: 'sess-1' })) };
        await handler(msg);
        return { consumerTag: 'tag-1' };
      });

      await service.consume(callback);
      expect(callback).toHaveBeenCalledWith({ sessionId: 'sess-1' });
      expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('devrait nack et requeue si le callback échoue', async () => {
      await service.onModuleInit();
      const callback = jest.fn().mockRejectedValue(new Error('Processing failed'));

      mockChannel.consume.mockImplementationOnce(async (_queue, handler, _opts) => {
        const msg = { content: Buffer.from(JSON.stringify({ sessionId: 'sess-1' })) };
        await handler(msg);
        return { consumerTag: 'tag-1' };
      });

      await service.consume(callback);
      expect(mockChannel.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    });

    it('devrait ignorer les messages null', async () => {
      await service.onModuleInit();
      const callback = jest.fn();

      mockChannel.consume.mockImplementationOnce(async (_queue, handler, _opts) => {
        await handler(null);
        return { consumerTag: 'tag-1' };
      });

      await service.consume(callback);
      expect(callback).not.toHaveBeenCalled();
    });

    it('devrait ne pas crash si le canal est null', async () => {
      // Pas de onModuleInit → channel null
      const callback = jest.fn();
      await expect(service.consume(callback)).resolves.not.toThrow();
    });
  });

  describe('close / onModuleDestroy', () => {
    it('devrait fermer le canal et la connexion', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();
      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('devrait reporter isConnected() = false après fermeture', async () => {
      await service.onModuleInit();
      await service.close();
      expect(service.isConnected()).toBe(false);
    });

    it('devrait ne pas crash si déjà fermé', async () => {
      await expect(service.close()).resolves.not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('devrait retourner false avant connexion', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('devrait retourner true après connexion', async () => {
      await service.onModuleInit();
      expect(service.isConnected()).toBe(true);
    });
  });
});

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private queueName: string;
  private exchangeName: string;

  // Reconnexion
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000; // 1s
  private reconnectAttempts = 0;
  private isReconnecting = false;
  private consumeCallback: ((message: any) => Promise<void>) | null = null;

  constructor(private configService: ConfigService) {
    this.queueName = this.configService.get('RABBITMQ_QUEUE') || 'tracking_events';
    this.exchangeName = this.configService.get('RABBITMQ_EXCHANGE') || 'tracking_exchange';
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.close();
  }

  private async connect(): Promise<void> {
    try {
      const url = `amqp://${this.configService.get('RABBITMQ_USER')}:${this.configService.get('RABBITMQ_PASSWORD')}@${this.configService.get('RABBITMQ_HOST')}:${this.configService.get('RABBITMQ_PORT')}`;

      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      // Déclarer l'exchange
      await this.channel.assertExchange(this.exchangeName, 'direct', { durable: true });

      // Déclarer la queue
      await this.channel.assertQueue(this.queueName, { durable: true });

      // Lier la queue à l'exchange
      await this.channel.bindQueue(this.queueName, this.exchangeName, '');

      // Réinitialiser le compteur de reconnexion
      this.reconnectAttempts = 0;
      this.isReconnecting = false;

      // Écouter les événements de déconnexion pour auto-reconnexion
      this.connection.on('error', (err) => {
        this.logger.error(`Connexion RabbitMQ erreur : ${err.message}`);
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        this.logger.warn('Connexion RabbitMQ fermée');
        this.handleDisconnect();
      });

      this.logger.log(`RabbitMQ connecté : ${this.queueName}`);
    } catch (error) {
      this.logger.error(`Erreur connexion RabbitMQ : ${error.message}`);
      throw error;
    }
  }

  // Reconnexion automatique avec backoff exponentiel
  private async handleDisconnect(): Promise<void> {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    this.channel = null;
    this.connection = null;

    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      this.logger.warn(
        `Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts} dans ${delay}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await this.connect();
        this.logger.log('Reconnexion RabbitMQ réussie');

        // Restaurer le consumer si actif avant la déconnexion
        if (this.consumeCallback) {
          await this.consume(this.consumeCallback);
          this.logger.log('Consumer RabbitMQ restauré après reconnexion');
        }
        return;
      } catch {
        this.logger.error(
          `Échec reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
        );
      }
    }

    this.isReconnecting = false;
    this.logger.error(
      `Abandon reconnexion après ${this.maxReconnectAttempts} tentatives`,
    );
  }

  isConnected(): boolean {
    return this.channel !== null && this.connection !== null;
  }

  async publish(event: any): Promise<boolean> {
    try {
      if (!this.channel) {
        this.logger.warn('Canal RabbitMQ non disponible, message non publié');
        return false;
      }

      const message = JSON.stringify(event);
      const success = this.channel.sendToQueue(
        this.queueName,
        Buffer.from(message),
        { persistent: true },
      );

      if (!success) {
        this.logger.warn('Message non publié (buffer plein)');
      }

      return success;
    } catch (error) {
      this.logger.error(`Erreur publication RabbitMQ : ${error.message}`);
      return false;
    }
  }

  async consume(callback: (message: any) => Promise<void>): Promise<void> {
    // Sauvegarder le callback pour restauration après reconnexion
    this.consumeCallback = callback;

    try {
      if (!this.channel) {
        this.logger.warn('Canal RabbitMQ non disponible, consommation reportée');
        return;
      }

      await this.channel.consume(
        this.queueName,
        async (msg) => {
          if (msg) {
            try {
              const event = JSON.parse(msg.content.toString());
              await callback(event);
              this.channel?.ack(msg);
            } catch (error) {
              this.logger.error(`Erreur traitement message : ${error.message}`);
              this.channel?.nack(msg, false, true); // Requeue le message
            }
          }
        },
        { noAck: false },
      );

      this.logger.log(`RabbitMQ consommation démarrée sur : ${this.queueName}`);
    } catch (error) {
      this.logger.error(`Erreur consommation RabbitMQ : ${error.message}`);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      this.channel = null;
      this.connection = null;
      this.logger.log('RabbitMQ déconnecté');
    } catch (error) {
      this.logger.error(`Erreur fermeture RabbitMQ : ${error.message}`);
    }
  }
}
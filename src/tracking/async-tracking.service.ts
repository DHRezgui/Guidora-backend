import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from './../rabbitmq/rabbitmq.service';
import { TrackEventDto } from './dto/track-event.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BehaviorEvent } from './entities/behavior_event.entity';

@Injectable()
export class AsyncTrackingService implements OnModuleInit {
  private readonly logger = new Logger(AsyncTrackingService.name);
  private readonly retryDelay = 1000; // 1s
  private readonly maxRetries = 3;

  constructor(
    private rabbitMQService: RabbitMQService,
    @InjectRepository(BehaviorEvent)
    private eventRepository: Repository<BehaviorEvent>,
  ) {}

  // Démarrer la consommation dès que le module est initialisé
  async onModuleInit(): Promise<void> {
    await this.startConsuming();
  }

  // Lancer la consommation de la queue RabbitMQ
  async startConsuming(): Promise<void> {
    try {
      await this.rabbitMQService.consume(async (eventData: any) => {
        await this.processEventFromQueue(eventData);
      });
      this.logger.log('Consumer de tracking démarré');
    } catch (error) {
      this.logger.error(`Erreur démarrage consumer : ${error.message}`);
    }
  }

  // Envoi asynchrone d'un événement
  async trackEventAsync(trackEventDto: TrackEventDto): Promise<{ accepted: boolean; eventId?: string }> {
    try {
      // 1. Publier dans RabbitMQ
      const published = await this.rabbitMQService.publish({
        ...trackEventDto,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (published) {
        this.logger.debug(`Événement accepté : ${trackEventDto.eventType} - ${trackEventDto.sessionId}`);
        return { accepted: true };
      } else {
        this.logger.warn(`Événement non publié (buffer plein) : ${trackEventDto.sessionId}`);
        return { accepted: false };
      }
    } catch (error) {
      this.logger.error(`Erreur envoi asynchrone : ${error.message}`, error.stack);
      return { accepted: false };
    }
  }

  // Envoi asynchrone d'un batch
  async trackBatchAsync(eventsDto: TrackEventDto[]): Promise<{ accepted: boolean; count: number }> {
    try {
      let successCount = 0;

      // Publier chaque événement
      for (const event of eventsDto) {
        const result = await this.trackEventAsync(event);
        if (result.accepted) successCount++;
      }

      this.logger.debug(`Batch accepté : ${successCount}/${eventsDto.length} événements`);
      return { accepted: successCount > 0, count: successCount };
    } catch (error) {
      this.logger.error(`Erreur batch asynchrone : ${error.message}`, error.stack);
      return { accepted: false, count: 0 };
    }
  }

  // Traitement des messages de la queue (worker)
  async processEventFromQueue(eventData: any): Promise<void> {
    let retries = eventData.retryCount || 0;

    try {
      // Valider les données
      if (!eventData.sessionId || !eventData.organizationId || !eventData.eventType) {
        this.logger.error(`Données invalides : ${JSON.stringify(eventData)}`);
        return; // Ne pas requeuer les données invalides
      }

      // Sauvegarder dans PostgreSQL
      const event: BehaviorEvent = this.eventRepository.create({
        ...eventData,
        timestamp: new Date(eventData.timestamp || Date.now()),
      } as Partial<BehaviorEvent>);

      await this.eventRepository.save(event);

      // Mettre à jour le cache Redis (optionnel)
      // await this.updateSessionCache(eventData.sessionId, eventData);

      this.logger.debug(`Événement traité : ${event.id} - ${event.eventType}`);
    } catch (error) {
      retries++;

      if (retries < this.maxRetries) {
        this.logger.warn(`Retry ${retries}/${this.maxRetries} pour événement : ${eventData.sessionId}`);

        // Requeuer avec délai exponentiel
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, retries - 1)));

        await this.rabbitMQService.publish({
          ...eventData,
          retryCount: retries,
        });
      } else {
        this.logger.error(`Échec définitif après ${this.maxRetries} retries : ${eventData.sessionId}`);
        // Optionnel : Sauvegarder dans une table d'erreurs
        await this.saveFailedEvent(eventData, error);
      }
    }
  }

  // ✅ Sauvegarder les événements échoués
  private async saveFailedEvent(eventData: any, error: Error): Promise<void> {
    try {
      // Créer une table "failed_events" si nécessaire
      await this.eventRepository.query(`
        CREATE TABLE IF NOT EXISTS failed_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_data JSONB NOT NULL,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      await this.eventRepository.query(
        `INSERT INTO failed_events (event_data, error_message, retry_count) 
         VALUES ($1, $2, $3)`,
        [JSON.stringify(eventData), error.message, eventData.retryCount || 0]
      );

      this.logger.warn(`Événement échoué sauvegardé`);
    } catch (saveError) {
      this.logger.error(`Erreur sauvegarde événement échoué : ${saveError.message}`);
    }
  }

  // Mise à jour du cache Redis (optionnel)
  private async updateSessionCache(sessionId: string, eventData: any): Promise<void> {
    try {
      // Implémenter la mise à jour du cache Redis
      // (similaire à la méthode dans tracking.service.ts)
    } catch (error) {
      this.logger.warn(`Erreur mise à jour cache : ${error.message}`);
    }
  }
}
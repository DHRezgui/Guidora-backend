import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AsyncTrackingService } from './async-tracking.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const asyncTrackingService = app.get(AsyncTrackingService);
  const rabbitMQService = app.get(RabbitMQService);
  const logger = new Logger('TrackingWorker');

  logger.log('Worker de tracking démarré');

  // Consommer les messages de la queue
  await rabbitMQService.consume(async (eventData: any) => {
    await asyncTrackingService.processEventFromQueue(eventData);
  });

  // Gérer les signaux de fermeture
  process.on('SIGINT', async () => {
    logger.log('Arrêt du worker...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.log('Arrêt du worker...');
    await app.close();
    process.exit(0);
  });
}

bootstrap();
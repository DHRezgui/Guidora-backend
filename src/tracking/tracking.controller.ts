import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AsyncTrackingService } from './async-tracking.service';
import { TrackEventDto } from './dto/track-event.dto';
import { BatchTrackEventsDto } from './dto/batch-track-events.dto';

@ApiTags('Tracking Events')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly asyncTrackingService: AsyncTrackingService) {}

  // Envoi asynchrone d'un événement (réponse immédiate)
  @Public()
  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted
  @ApiOperation({ 
    summary: 'Enregistrer un événement (asynchrone)',
    description: 'Accepte l\'événement et le traite en arrière-plan via RabbitMQ. Réponse immédiate (202) pour ne pas bloquer le client SDK.'
  })
  @ApiBody({ 
    type: TrackEventDto,
    description: 'Données de l\'événement à enregistrer',
  })
  @ApiResponse({ 
    status: 202, 
    description: 'Événement accepté pour traitement asynchrone',
    schema: {
      example: {
        success: true,
        message: 'Événement accepté',
        accepted: true
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Événement rejeté (buffer RabbitMQ plein)',
    schema: {
      example: {
        success: false,
        message: 'Événement rejeté (buffer plein)',
        accepted: false
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides',
    schema: {
      example: {
        message: ['sessionId must be a UUID', 'eventType must be a valid enum value'],
        error: 'Bad Request',
        statusCode: 400
      }
    }
  })
  async trackEvent(@Body() trackEventDto: TrackEventDto) {
    const result = await this.asyncTrackingService.trackEventAsync(trackEventDto);
    
    return {
      success: result.accepted,
      message: result.accepted ? 'Événement accepté' : 'Événement rejeté (buffer plein)',
      accepted: result.accepted,
    };
  }

  // Envoi asynchrone d'un batch (réponse immédiate)
  @Public()
  @Post('events/batch')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted
  @ApiOperation({ 
    summary: 'Enregistrer un batch d\'événements (asynchrone)',
    description: 'Accepte le batch et le traite en arrière-plan via RabbitMQ. Optimisé pour les performances SDK (envoi groupé).'
  })
  @ApiBody({
    type: BatchTrackEventsDto,
    description: 'Batch d\'événements à enregistrer',
  })
  @ApiResponse({ 
    status: 202, 
    description: 'Batch accepté pour traitement asynchrone',
    schema: {
      example: {
        success: true,
        message: 'Batch accepté (50/50 événements)',
        accepted: true,
        count: 50
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Batch rejeté (buffer RabbitMQ plein)',
    schema: {
      example: {
        success: false,
        message: 'Batch rejeté (buffer plein)',
        accepted: false,
        count: 0
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Données invalides dans le batch',
    schema: {
      example: {
        message: ['events.0.sessionId must be a UUID', 'events.1.eventType must be a valid enum value'],
        error: 'Bad Request',
        statusCode: 400
      }
    }
  })
  async trackBatch(@Body() batchDto: BatchTrackEventsDto) {
    const result = await this.asyncTrackingService.trackBatchAsync(batchDto.events);
    
    return {
      success: result.accepted,
      message: result.accepted 
        ? `Batch accepté (${result.count}/${batchDto.events.length} événements)`
        : 'Batch rejeté (buffer plein)',
      accepted: result.accepted,
      count: result.count,
    };
  }
}
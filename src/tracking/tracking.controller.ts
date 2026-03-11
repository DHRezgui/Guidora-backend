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

  // Asynchronous single event submission (immediate response)
  @Public()
  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted
  @ApiOperation({ 
    summary: 'Track an event (async)',
    description: 'Accepts the event and processes it in the background via RabbitMQ. Immediate response (202) to avoid blocking the SDK client.'
  })
  @ApiBody({ 
    type: TrackEventDto,
    description: 'Event data to track',
  })
  @ApiResponse({ 
    status: 202, 
    description: 'Event accepted for async processing',
    schema: {
      example: {
        success: true,
        message: 'Event accepted',
        accepted: true
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Event rejected (RabbitMQ buffer full)',
    schema: {
      example: {
        success: false,
        message: 'Event rejected (buffer full)',
        accepted: false
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data',
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

  // Asynchronous batch submission (immediate response)
  @Public()
  @Post('events/batch')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted
  @ApiOperation({ 
    summary: 'Track a batch of events (async)',
    description: 'Accepts the batch and processes it in the background via RabbitMQ. Optimized for SDK performance (grouped submission).'
  })
  @ApiBody({
    type: BatchTrackEventsDto,
    description: 'Batch of events to track',
  })
  @ApiResponse({ 
    status: 202, 
    description: 'Batch accepted for async processing',
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
    description: 'Batch rejected (RabbitMQ buffer full)',
    schema: {
      example: {
        success: false,
        message: 'Batch rejected (buffer full)',
        accepted: false,
        count: 0
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data in the batch',
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
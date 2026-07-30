import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AsyncTrackingService } from './async-tracking.service';
import { TrackEventDto } from './dto/track-event.dto';
import { BatchTrackEventsDto } from './dto/batch-track-events.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireSdkScopes } from '../auth/decorators/require-sdk-scopes.decorator';
import { ApiAuth } from '../swagger/security-schemas';
import type { RequestAuthUser } from '../auth/types/request-auth-user.type';

@ApiTags('Tracking Events')
@Controller('tracking')
@ApiAuth()
export class TrackingController {
  constructor(private readonly asyncTrackingService: AsyncTrackingService) {}

  private resolveOrganizationId(user: RequestAuthUser): string {
    if (!user?.organizationId) {
      throw new ForbiddenException('Aucune organisation associée au token SDK.');
    }
    return user.organizationId;
  }

  private bindOrganization(dto: TrackEventDto, organizationId: string): TrackEventDto {
    return { ...dto, organizationId };
  }

  // Asynchronous single event submission (immediate response)
  @RequireSdkScopes('tours:runtime')
  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted
  @ApiOperation({ 
    summary: 'Track an event (async)',
    description:
      'Accepts the event and processes it in the background via RabbitMQ. ' +
      'Requires an SDK token (td_sdk_ / td_sess_) with tours:runtime. ' +
      'organizationId is always taken from the token (client value ignored).',
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
  @ApiResponse({ status: 401, description: 'Missing or invalid SDK token' })
  @ApiResponse({ status: 403, description: 'Missing tours:runtime scope' })
  async trackEvent(
    @Body() trackEventDto: TrackEventDto,
    @CurrentUser() user: RequestAuthUser,
  ) {
    const organizationId = this.resolveOrganizationId(user);
    const result = await this.asyncTrackingService.trackEventAsync(
      this.bindOrganization(trackEventDto, organizationId),
    );
    
    return {
      success: result.accepted,
      message: result.accepted ? 'Événement accepté' : 'Événement rejeté (buffer plein)',
      accepted: result.accepted,
    };
  }

  // Asynchronous batch submission (immediate response)
  @RequireSdkScopes('tours:runtime')
  @Post('events/batch')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted
  @ApiOperation({ 
    summary: 'Track a batch of events (async)',
    description:
      'Accepts the batch and processes it in the background via RabbitMQ. ' +
      'Requires an SDK token with tours:runtime. organizationId is always taken from the token.',
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
  @ApiResponse({ status: 401, description: 'Missing or invalid SDK token' })
  @ApiResponse({ status: 403, description: 'Missing tours:runtime scope' })
  async trackBatch(
    @Body() batchDto: BatchTrackEventsDto,
    @CurrentUser() user: RequestAuthUser,
  ) {
    const organizationId = this.resolveOrganizationId(user);
    const events = (batchDto.events || []).map((event) =>
      this.bindOrganization(event, organizationId),
    );
    const result = await this.asyncTrackingService.trackBatchAsync(events);
    
    return {
      success: result.accepted,
      message: result.accepted 
        ? `Batch accepté (${result.count}/${events.length} événements)`
        : 'Batch rejeté (buffer plein)',
      accepted: result.accepted,
      count: result.count,
    };
  }
}

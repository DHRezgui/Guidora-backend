import { Controller, Get, HttpCode, HttpStatus, Query, Param, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../user/entities/user.entity';
import { TrackingService } from './tracking.service';
import { EventType } from './enums/tracking.enums';
import { ApiAuth } from '../swagger/security-schemas';
import {
  assertOrganizationScopedAccess,
  isSuperAdmin,
} from '../common/membership-roles.util';

type AnalyticsUser = { role?: UserRole; organizationId?: string | null };

@ApiTags('Analytics Tracking')
@Controller('tracking/analytics')
export class TrackingAnalyticsController {
  constructor(private readonly trackingService: TrackingService) {}

  private resolveSessionOrganizationFilter(user: AnalyticsUser): string | undefined {
    if (isSuperAdmin(user.role)) {
      return undefined;
    }
    if (!user.organizationId) {
      throw new ForbiddenException('Aucune organisation associée à cet utilisateur.');
    }
    return user.organizationId;
  }

  // Retrieve events of a session (ADMIN/DEVELOPER)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get('sessions/:sessionId/events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Session events',
    description: 'Returns all events of a specific session'
  })
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Unique session identifier' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100, description: 'Maximum number of events to return' })
  @ApiResponse({
    status: 200,
    description: 'Events retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - insufficient role',
  })
  async getSessionEvents(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit: number = 100,
    @CurrentUser() user: AnalyticsUser,
  ) {
    const organizationId = this.resolveSessionOrganizationFilter(user);
    const events = await this.trackingService.findEventsBySession(
      sessionId,
      limit,
      organizationId,
    );
    return {
      success: true,
      count: events.length,
      events,
    };
  }

  // Analyze frictions of a session (ADMIN/DEVELOPER)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get('sessions/:sessionId/frictions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Friction analysis',
    description: 'Behavioral analysis to detect signs of friction'
  })
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Unique session identifier' })
  @ApiResponse({
    status: 200,
    description: 'Friction analysis completed',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - insufficient role',
  })
  async analyzeSessionFrictions(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AnalyticsUser,
  ) {
    const organizationId = this.resolveSessionOrganizationFilter(user);
    const frictions = await this.trackingService.analyzeSessionFrictions(
      sessionId,
      organizationId,
    );
    return {
      success: true,
      sessionId,
      frictions,
      riskLevel: this.calculateRiskLevel(frictions),
    };
  }

  // Events by organization (ADMIN/DEVELOPER)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get('organizations/:organizationId/events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Events by organization',
    description: 'Filter events by organization and criteria'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', description: 'Unique organization identifier' })
  @ApiQuery({ name: 'eventType', required: false, enum: EventType, enumName: 'EventType', description: 'Filter by event type' })
  @ApiQuery({ name: 'startDate', required: false, type: String, example: '2026-02-15T00:00:00Z', description: 'Start date (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, example: '2026-02-15T23:59:59Z', description: 'End date (ISO 8601)' })
  @ApiQuery({ name: 'pageUrl', required: false, type: String, description: 'Filter by page URL (partial match)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100, description: 'Maximum number of events to return' })
  @ApiResponse({
    status: 200,
    description: 'Events retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - insufficient role',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found',
  })
  async getOrganizationEvents(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AnalyticsUser,
    @Query('eventType') eventType?: EventType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('pageUrl') pageUrl?: string,
    @Query('limit') limit?: number,
  ) {
    assertOrganizationScopedAccess(user, organizationId);
    const events = await this.trackingService.findEventsByOrganization(organizationId, {
      eventType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      pageUrl,
      limit: limit ? parseInt(limit.toString()) : undefined,
    });

    return {
      success: true,
      count: events.length,
      events,
    };
  }

  // Utility method to calculate the risk level
  private calculateRiskLevel(frictions: Record<string, number>): string {
    const totalFrictions = Object.values(frictions).reduce((sum: number, count: number) => sum + count, 0);
    
    if (totalFrictions >= 10) return 'HIGH';
    if (totalFrictions >= 5) return 'MEDIUM';
    if (totalFrictions >= 2) return 'LOW';
    return 'NONE';
  }
}

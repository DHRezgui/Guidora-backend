import { Controller, Get, HttpCode, HttpStatus, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { TrackingService } from './tracking.service';
import { EventType } from './enums/tracking.enums';
import { ApiAuth } from '../swagger/security-schemas';

@ApiTags('Analytics Tracking')
@Controller('tracking/analytics')
export class TrackingAnalyticsController {
  constructor(private readonly trackingService: TrackingService) {}


  // Récupérer les événements d'une session (ADMIN/DEVELOPER)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get('sessions/:sessionId/events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Événements d\'une session',
    description: 'Retourne tous les événements d\'une session spécifique'
  })
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Identifiant unique de la session' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100, description: 'Nombre maximum d\'événements à retourner' })
  @ApiResponse({
    status: 200,
    description: 'Événements récupérés avec succès',
    schema: {
      example: {
        success: true,
        count: 5,
        events: [
          {
            id: 'evt-uuid-1',
            sessionId: 'sess-uuid',
            organizationId: 'org-uuid',
            eventType: 'CLICK',
            pageUrl: '/dashboard/transfers',
            elementSelector: '#transfer-button',
            timeOnPage: 30,
            metadata: {},
            timestamp: '2026-02-15T10:30:00.000Z'
          }
        ]
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'Accès refusé - rôle insuffisant',
    schema: {
      example: {
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403
      }
    }
  })
  async getSessionEvents(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit: number = 100,
  ) {
    const events = await this.trackingService.findEventsBySession(sessionId, limit);
    return {
      success: true,
      count: events.length,
      events,
    };
  }

  // Analyser les frictions d'une session (ADMIN/DEVELOPER)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get('sessions/:sessionId/frictions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Analyse des frictions',
    description: 'Analyse comportementale pour détecter les signes de friction'
  })
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Identifiant unique de la session' })
  @ApiResponse({
    status: 200,
    description: 'Analyse des frictions effectuée',
    schema: {
      example: {
        success: true,
        sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        frictions: {
          clickMisses: 2,
          scrollHesitations: 1,
          excessiveTimeOnPage: 0,
          formAbandonments: 0,
          navigationBacks: 0
        },
        riskLevel: 'LOW'
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'Accès refusé - rôle insuffisant',
    schema: {
      example: {
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403
      }
    }
  })
  async analyzeSessionFrictions(@Param('sessionId') sessionId: string) {
    const frictions = await this.trackingService.analyzeSessionFrictions(sessionId);
    return {
      success: true,
      sessionId,
      frictions,
      riskLevel: this.calculateRiskLevel(frictions),
    };
  }

  // Événements par organisation (ADMIN/DEVELOPER)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get('organizations/:organizationId/events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Événements par organisation',
    description: 'Filtrer les événements par organisation et critères'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', description: 'Identifiant unique de l\'organisation' })
  @ApiQuery({ name: 'eventType', required: false, enum: EventType, enumName: 'EventType', description: 'Filtrer par type d\'événement' })
  @ApiQuery({ name: 'startDate', required: false, type: String, example: '2026-02-15T00:00:00Z', description: 'Date de début (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, example: '2026-02-15T23:59:59Z', description: 'Date de fin (ISO 8601)' })
  @ApiQuery({ name: 'pageUrl', required: false, type: String, description: 'Filtrer par URL de page (recherche partielle)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100, description: 'Nombre maximum d\'événements à retourner' })
  @ApiResponse({
    status: 200,
    description: 'Événements récupérés avec succès',
    schema: {
      example: {
        success: true,
        count: 10,
        events: [
          {
            id: 'evt-uuid-1',
            sessionId: 'sess-uuid',
            organizationId: 'org-uuid',
            eventType: 'CLICK',
            pageUrl: '/dashboard/transfers',
            elementSelector: '#transfer-button',
            elementText: 'Virement',
            timeOnPage: 30,
            metadata: {},
            timestamp: '2026-02-15T10:30:00.000Z'
          }
        ]
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'Accès refusé - rôle insuffisant',
    schema: {
      example: {
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403
      }
    }
  })
  @ApiResponse({
    status: 404,
    description: 'Organisation introuvable',
    schema: {
      example: {
        message: 'Organisation introuvable',
        error: 'Not Found',
        statusCode: 404
      }
    }
  })
  async getOrganizationEvents(
    @Param('organizationId') organizationId: string,
    @Query('eventType') eventType?: EventType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('pageUrl') pageUrl?: string,
    @Query('limit') limit?: number,
  ) {
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

  // Méthode utilitaire pour calculer le niveau de risque
  private calculateRiskLevel(frictions: Record<string, number>): string {
    const totalFrictions = Object.values(frictions).reduce((sum: number, count: number) => sum + count, 0);
    
    if (totalFrictions >= 10) return 'HIGH';
    if (totalFrictions >= 5) return 'MEDIUM';
    if (totalFrictions >= 2) return 'LOW';
    return 'NONE';
  }
}
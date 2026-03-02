import { Controller, Get, Post, HttpCode, HttpStatus, UseGuards, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { BehaviorAnalysisService } from './behavior-analysis.service';
import { ApiAuth } from '../swagger/security-schemas';

@ApiTags('Analyse Comportementale')
@Controller('analysis')
@UseGuards(RolesGuard)
@ApiAuth()
export class BehaviorAnalysisController {
  constructor(private readonly analysisService: BehaviorAnalysisService) {}

  // Analyser une session spécifique
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Post('sessions/:sessionId/analyze')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Analyser une session',
    description: 'Effectue une analyse comportementale complète d\'une session utilisateur'
  })
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid' })
  @ApiResponse({ 
    status: 201, 
    description: 'Analyse effectuée',
    schema: {
      example: {
        success: true,
        message: 'Analyse effectuée',
        analysis: {
          id: 'analysis-uuid',
          sessionId: 'sess-uuid',
          abandonmentRisk: 0.78,
          helpTriggered: true,
          analyzedAt: '2026-02-15T10:30:00.000Z'
        }
      }
    }
  })
  async analyzeSession(@Param('sessionId') sessionId: string, @Query('organizationId') organizationId: string) {
    const analysis = await this.analysisService.analyzeSession(sessionId, organizationId);
    return {
      success: true,
      message: 'Analyse effectuée',
      analysis,
    };
  }

  // Analyser toutes les sessions d'une organisation
  @Roles(UserRole.ADMIN)
  @Post('organizations/:organizationId/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ 
    summary: 'Analyser toutes les sessions',
    description: 'Lance l\'analyse comportementale de toutes les sessions d\'une organisation'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiResponse({ 
    status: 202, 
    description: 'Analyse en cours',
    schema: {
      example: {
        success: true,
        message: 'Analyse en cours',
        processedSessions: 150
      }
    }
  })
  async analyzeOrganization(@Param('organizationId') organizationId: string) {
    const processed = await this.analysisService.analyzeOrganizationSessions(organizationId);
    return {
      success: true,
      message: 'Analyse en cours',
      processedSessions: processed,
    };
  }

  // Obtenir les statistiques d'une organisation
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('organizations/:organizationId/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Statistiques organisation',
    description: 'Retourne les métriques agrégées d\'une organisation'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiResponse({ 
    status: 200, 
    description: 'Statistiques récupérées',
    schema: {
      example: {
        success: true,
        stats: {
          totalSessions: 1250,
          totalUsers: 350,
          avgTimeOnPage: 45.5,
          avgScrollDepth: 65.2,
          avgAbandonmentRisk: 0.32,
          helpTriggeredCount: 87,
          highRiskCount: 42,
          medianTimeOnPage: 38.0,
          medianScrollDepth: 60.5
        }
      }
    }
  })
  async getOrganizationStats(@Param('organizationId') organizationId: string) {
    const stats = await this.analysisService.getOrganizationStats(organizationId);
    return {
      success: true,
      stats,
    };
  }

  // Obtenir les tendances temporelles
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('organizations/:organizationId/trends')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Tendances temporelles',
    description: 'Retourne les données temporelles pour visualisation'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  @ApiResponse({ status: 200, description: 'Tendances récupérées' })
  async getTimeSeries(@Param('organizationId') organizationId: string, @Query('days') days: number = 30) {
    const data = await this.analysisService.getTimeSeriesData(organizationId, days);
    return {
      success: true,
      days,
      data,
    };
  }

  // Préparer le dataset ML
  @Roles(UserRole.ADMIN)
  @Get('organizations/:organizationId/ml-dataset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Dataset ML',
    description: 'Prépare et retourne le dataset pour l\'entraînement ML'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Dataset préparé' })
  async getMLDataset(@Param('organizationId') organizationId: string) {
    const dataset = await this.analysisService.prepareMLDataset(organizationId);
    return {
      success: true,
      count: dataset.length,
      dataset,
    };
  }

  // Exporter les données ML au format CSV
  @Roles(UserRole.ADMIN)
  @Get('organizations/:organizationId/ml-export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Export ML CSV',
    description: 'Exporte les données ML au format CSV pour entraînement externe'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  async exportMLData(@Param('organizationId') organizationId: string) {
    const csvData = await this.analysisService.exportMLData(organizationId);
    
    return {
      success: true,
      filename: `ml_dataset_${organizationId}_${new Date().toISOString().split('T')[0]}.csv`,
      contentType: 'text/csv',
      data: csvData,
    };
  }
}
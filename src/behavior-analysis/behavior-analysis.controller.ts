import { Controller, Get, Post, HttpCode, HttpStatus, UseGuards, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { BehaviorAnalysisService } from './behavior-analysis.service';
import { ApiAuth } from '../swagger/security-schemas';

@ApiTags('Behavior Analysis')
@Controller('analysis')
@UseGuards(RolesGuard)
@ApiAuth()
export class BehaviorAnalysisController {
  constructor(private readonly analysisService: BehaviorAnalysisService) {}

  // Analyze a specific session
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Post('sessions/:sessionId/analyze')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Analyze a session',
    description: 'Performs a complete behavioral analysis of a user session'
  })
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid' })
  @ApiResponse({ 
    status: 201, 
    description: 'Analysis completed',
    schema: {
      example: {
        success: true,
        message: 'Analysis completed',
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

  // Analyze all sessions of an organization
  @Roles(UserRole.ADMIN)
  @Post('organizations/:organizationId/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ 
    summary: 'Analyze all sessions',
    description: 'Launches behavioral analysis of all sessions in an organization'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiResponse({ 
    status: 202, 
    description: 'Analysis in progress',
    schema: {
      example: {
        success: true,
        message: 'Analysis in progress',
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

  // Get organization statistics
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('organizations/:organizationId/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Organization statistics',
    description: 'Returns aggregated metrics for an organization'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiResponse({ 
    status: 200, 
    description: 'Statistics retrieved',
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

  // Get time series trends
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('organizations/:organizationId/trends')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Time series trends',
    description: 'Returns time series data for visualization'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30 })
  @ApiResponse({ status: 200, description: 'Trends retrieved' })
  async getTimeSeries(@Param('organizationId') organizationId: string, @Query('days') days: number = 30) {
    const data = await this.analysisService.getTimeSeriesData(organizationId, days);
    return {
      success: true,
      days,
      data,
    };
  }

  // Prepare ML dataset
  @Roles(UserRole.ADMIN)
  @Get('organizations/:organizationId/ml-dataset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'ML Dataset',
    description: 'Prepares and returns the dataset for ML training'
  })
  @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Dataset prepared' })
  async getMLDataset(@Param('organizationId') organizationId: string) {
    const dataset = await this.analysisService.prepareMLDataset(organizationId);
    return {
      success: true,
      count: dataset.length,
      dataset,
    };
  }

  // Export ML data as CSV
  @Roles(UserRole.ADMIN)
  @Get('organizations/:organizationId/ml-export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'ML CSV Export',
    description: 'Exports ML data in CSV format for external training'
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
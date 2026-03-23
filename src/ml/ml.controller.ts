import { Controller, Get, Param, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { DatasetGeneratorService } from './dataset-generator.service';
import { ApiAuth } from '../swagger/security-schemas';
import { BehaviorAnalysisService } from '../behavior-analysis/behavior-analysis.service';

@ApiTags('Machine Learning')
@Controller('ml')
@UseGuards(RolesGuard)
@ApiAuth()
export class MlController {
  constructor(
    private readonly datasetService: DatasetGeneratorService,
    private readonly behaviorAnalysisService: BehaviorAnalysisService,
  ) {}

  // Generate dataset for an organization
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('organizations/:organizationId/datasets')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Generate ML dataset',
    description: 'Builds a training-ready dataset from aggregated behavioral analysis for the provided organization.'
  })
  @ApiParam({
    name: 'organizationId',
    type: String,
    format: 'uuid',
    description: 'Organization identifier',
    example: 'aa108e3f-0ef0-4a9a-889e-d252e115c3fc',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Dataset generated successfully',
    schema: {
      example: {
        success: true,
        dataset: {
          organizationId: 'org-uuid',
          totalSamples: 1500,
          features: [],
          metadata: {
            generatedAt: '2026-03-23T12:00:00.000Z',
            version: '1.1',
            featureNames: ['timeOnPage', 'scrollDepth'],
          },
        }
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - insufficient role',
    schema: {
      example: {
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403,
      },
    },
  })
  async generateDataset(@Param('organizationId') organizationId: string) {
    const dataset = await this.datasetService.generateDataset(organizationId);
    return {
      success: true,
      dataset,
    };
  }

  // Export dataset in CSV format
  @Roles(UserRole.ADMIN)
  @Get('organizations/:organizationId/datasets/export/csv')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Export dataset (CSV)',
    description: 'Returns dataset content and metadata in CSV format for external model training workflows.'
  })
  @ApiParam({
    name: 'organizationId',
    type: String,
    format: 'uuid',
    description: 'Organization identifier',
  })
  @ApiResponse({
    status: 200,
    description: 'CSV dataset export generated',
    schema: {
      example: {
        success: true,
        filename: 'ml_dataset_aa108e3f-0ef0-4a9a-889e-d252e115c3fc_2026-03-23.csv',
        contentType: 'text/csv',
        csvData:
          'sessionId,timeOnPage,scrollDepth,clickMisses,hesitations,abandonmentRisk,helpTriggered,hasError,multiplePages,label\n3f50c2a1-8c4d-4f3a-9c2e-1a2b3c4d5e6f,83,41.4,0,2,0.2,0,0,1,0',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - admin only',
    schema: {
      example: {
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403,
      },
    },
  })
  async exportDatasetCSV(@Param('organizationId') organizationId: string) {
    const csvData = await this.datasetService.exportDatasetCSV(organizationId);
    
    return {
      success: true,
      filename: `ml_dataset_${organizationId}_${new Date().toISOString().split('T')[0]}.csv`,
      contentType: 'text/csv',
      csvData,
    };
  }

  // Export dataset in JSON format
  @Roles(UserRole.ADMIN)
  @Get('organizations/:organizationId/datasets/export/json')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Export dataset (JSON)',
    description: 'Returns dataset content and metadata in JSON format for external model training workflows.'
  })
  @ApiParam({
    name: 'organizationId',
    type: String,
    format: 'uuid',
    description: 'Organization identifier',
  })
  @ApiResponse({
    status: 200,
    description: 'JSON dataset export generated',
    schema: {
      example: {
        success: true,
        filename: 'ml_dataset_aa108e3f-0ef0-4a9a-889e-d252e115c3fc_2026-03-23.json',
        contentType: 'application/json',
        data: '{"organizationId":"aa108e3f-0ef0-4a9a-889e-d252e115c3fc","totalSamples":1,"features":[{"timeOnPage":83,"scrollDepth":41.4,"clickMisses":0,"hesitations":2,"abandonmentRisk":0.2,"helpTriggered":0,"hasError":0,"multiplePages":1,"label":0,"sessionId":"3f50c2a1-8c4d-4f3a-9c2e-1a2b3c4d5e6f","userId":null,"analyzedAt":"2026-03-23T13:00:00.000Z"}],"metadata":{"generatedAt":"2026-03-23T13:01:00.000Z","version":"1.1","featureNames":["timeOnPage","scrollDepth"]}}',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - admin only',
    schema: {
      example: {
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403,
      },
    },
  })
  async exportDatasetJSON(@Param('organizationId') organizationId: string) {
    const jsonData = await this.datasetService.exportDatasetJSON(organizationId);
    
    return {
      success: true,
      filename: `ml_dataset_${organizationId}_${new Date().toISOString().split('T')[0]}.json`,
      contentType: 'application/json',
      data: jsonData,
    };
  }

  // Dataset quality statistics
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('organizations/:organizationId/datasets/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Dataset quality statistics',
    description: 'Returns dataset quality indicators such as class balance, missing values, and training readiness.'
  })
  @ApiParam({
    name: 'organizationId',
    type: String,
    format: 'uuid',
    description: 'Organization identifier',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Dataset statistics retrieved',
    schema: {
      example: {
        success: true,
        stats: {
          totalSamples: 1500,
          positiveSamples: 350,
          negativeSamples: 1150,
          imbalanceRatio: 0.3,
          avgFeaturesPerSample: 8,
          missingValues: 0,
          schemaVersion: '1.1',
          isEnoughDataForTraining: true,
          hasAcceptableClassBalance: true,
        }
      }
    }
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - insufficient role',
    schema: {
      example: {
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403,
      },
    },
  })
  async getDatasetStats(@Param('organizationId') organizationId: string) {
    const quality = await this.datasetService.getDatasetQualityReport(organizationId);
    
    return {
      success: true,
      stats: {
        totalSamples: quality.totalSamples,
        positiveSamples: quality.positiveSamples,
        negativeSamples: quality.negativeSamples,
        imbalanceRatio: quality.imbalanceRatio,
        avgFeaturesPerSample: quality.featuresPerSample,
        missingValues: quality.missingValues,
        schemaVersion: quality.schemaVersion,
        isEnoughDataForTraining: quality.isEnoughDataForTraining,
        hasAcceptableClassBalance: quality.hasAcceptableClassBalance,
      },
    };
  }

  // Refresh analysis source before dataset generation
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Post('organizations/:organizationId/datasets/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh dataset source',
    description: 'Re-runs behavior analysis for organization sessions, then returns fresh dataset quality indicators.',
  })
  @ApiParam({
    name: 'organizationId',
    type: String,
    format: 'uuid',
    description: 'Organization identifier',
  })
  @ApiResponse({
    status: 200,
    description: 'Refresh completed',
    schema: {
      example: {
        success: true,
        processedSessions: 42,
        datasetQuality: {
          schemaVersion: '1.1',
          totalSamples: 240,
          positiveSamples: 55,
          negativeSamples: 185,
          imbalanceRatio: 0.229,
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - insufficient role',
    schema: {
      example: {
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403,
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error during analysis refresh',
    schema: {
      example: {
        statusCode: 500,
        message: 'Internal server error',
      },
    },
  })
  async refreshDatasetSource(@Param('organizationId') organizationId: string) {
    const processedSessions = await this.behaviorAnalysisService.analyzeOrganizationSessions(organizationId);
    const quality = await this.datasetService.getDatasetQualityReport(organizationId);

    return {
      success: true,
      processedSessions,
      datasetQuality: quality,
    };
  }
}
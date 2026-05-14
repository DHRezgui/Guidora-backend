import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, UseGuards, ParseUUIDPipe, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../user/entities/user.entity';
import { GuidedTourService } from './guided-tour.service';
import { CreateGuidedTourDto } from './dto/create-guided-tour.dto';
import { UpdateGuidedTourDto } from './dto/update-guided-tour.dto';
import { ResetTourUserDto } from './dto/reset-tour-user.dto';
import { ResetTourSegmentDto } from './dto/reset-tour-segment.dto';
import { GuidedTour } from './entities/guided-tour.entity';
import { TourUserStateStatus } from './entities/tour-user-state.entity';
import { ApiAuth } from '../swagger/security-schemas';
import { PublishContextualDraftsDto } from './dto/publish-contextual-drafts.dto';
import { ContextualFeedbackService } from './contextual-feedback.service';
import { SubmitContextualFeedbackDto } from './dto/submit-contextual-feedback.dto';

@ApiTags('Guided Tour')
@Controller('tours')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class GuidedTourController {
  constructor(
    private readonly tourService: GuidedTourService,
    private readonly contextualFeedbackService: ContextualFeedbackService,
  ) {}

  private getOrganizationId(user: any): string {
    const organizationId = user?.organizationId || user?.organizations?.[0]?.id;
    if (!organizationId) {
      throw new BadRequestException('Aucune organisation associee a cet utilisateur.');
    }
    return organizationId;
  }

  // Create a tour (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Create a new guided tour',
    description: 'Creates a complete tour with its steps for an organization'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Tour created successfully',
    schema: {
      example: {
        success: true,
        message: 'Tour created successfully',
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'First transfer',
          description: 'Step-by-step guide to make your first bank transfer',
          targetUrl: '/dashboard/transfers',
          isActive: true,
          priority: 10,
          triggerConditions: {
            minTimeOnPage: 30,
            requiredElements: ['#transfer-button'],
            userSegment: 'new_user',
          },
          organizationId: 'org-uuid',
          createdBy: 'user-uuid',
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-15T10:30:00.000Z',
          steps: [
            {
              id: 'step-uuid-1',
              orderIndex: 1,
              title: 'Welcome!',
              content: 'Click here to start your first transfer',
              targetSelector: '#transfer-button',
              position: 'BOTTOM',
              action: 'CLICK',
              skipAllowed: true,
              highlightElement: true,
            }
          ]
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async create(
    @Body() createTourDto: CreateGuidedTourDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.create(
      createTourDto,
      organizationId,
      user.id,
    );
    return {
      success: true,
      message: 'Tour created successfully',
      tour,
    };
  }

  @Roles(UserRole.ADMIN)
  @Post('contextual/publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publish contextual drafts',
    description: 'Apply quality gates, deduplication and activation policy to SDK contextual drafts.',
  })
  @ApiResponse({
    status: 201,
    description: 'Contextual drafts processed',
  })
  async publishContextualDrafts(
    @Body() publishDto: PublishContextualDraftsDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const report = await this.tourService.publishContextualDrafts(
      publishDto,
      organizationId,
      user.id,
    );

    return {
      success: true,
      message: 'Contextual drafts processed successfully',
      report,
    };
  }

  @Post('contextual/feedback')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Ingest contextual feedback events',
    description:
      'Accepts batched feedback deltas (shown/clicked/completed/skipped) from the SDK runtime and upserts cumulative aggregates per (org, targetUrl, selector, intent).',
  })
  @ApiResponse({ status: 202, description: 'Feedback batch accepted' })
  async submitContextualFeedback(
    @Body() dto: SubmitContextualFeedbackDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const result = await this.contextualFeedbackService.ingestBatch(organizationId, dto);
    return {
      success: true,
      accepted: result.accepted,
    };
  }

  @Get('contextual/feedback/aggregates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read contextual feedback aggregates',
    description:
      'Returns cumulative feedback counters for the current organization, optionally filtered by targetUrl. The SDK uses this to bias contextual draft scoring with cross-user signal.',
  })
  @ApiQuery({ name: 'targetUrl', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Max 2000, default 500' })
  @ApiResponse({ status: 200, description: 'Aggregate list' })
  async getContextualFeedbackAggregates(
    @CurrentUser() user: any,
    @Query('targetUrl') targetUrl?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.getOrganizationId(user);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const aggregates = await this.contextualFeedbackService.getAggregates(organizationId, {
      targetUrl,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
    return {
      success: true,
      count: aggregates.length,
      aggregates,
    };
  }

  // List tours of an organization
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'List tours of an organization',
    description: 'Returns all tours (active/inactive) of the user\'s organization'
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status (true = active only, false = inactive only)' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of tours',
    schema: {
      example: {
        success: true,
        count: 2,
        tours: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            name: 'First transfer',
            description: 'Step-by-step guide to make your first bank transfer',
            targetUrl: '/dashboard/transfers',
            isActive: true,
            priority: 10,
            triggerConditions: { minTimeOnPage: 30 },
            organizationId: 'org-uuid',
            createdBy: 'user-uuid',
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z',
            steps: [
              {
                id: 'step-uuid-1',
                orderIndex: 1,
                title: 'Welcome!',
                content: 'Click here to start',
                targetSelector: '#transfer-button',
                position: 'BOTTOM',
                action: 'CLICK',
                skipAllowed: true,
                highlightElement: true,
              }
            ]
          },
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            name: 'Dashboard discovery',
            description: 'Overview of the main features',
            targetUrl: '/dashboard',
            isActive: false,
            priority: 5,
            triggerConditions: {},
            organizationId: 'org-uuid',
            createdBy: 'user-uuid',
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z',
            steps: []
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async findAll(
    @CurrentUser() user: any,
    @Query('isActive') isActive?: boolean,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tours = await this.tourService.findAllByOrganization(organizationId, isActive);
    return {
      success: true,
      count: tours.length,
      tours,
    };
  }

  // Find active tours for a URL (for the SDK)
  @Get('active/url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Active tours for a URL',
    description: 'Returns active tours matching a target URL (used by the client SDK)'
  })
  @ApiQuery({ name: 'url', required: true, type: String, description: 'The page URL to search active tours for', example: '/dashboard/transfers' })
  @ApiResponse({ 
    status: 200, 
    description: 'Active tours found for this URL',
    schema: {
      example: {
        success: true,
        count: 1,
        tours: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            name: 'First transfer',
            description: 'Step-by-step guide to make your first bank transfer',
            targetUrl: '/dashboard/transfers',
            isActive: true,
            priority: 10,
            triggerConditions: { minTimeOnPage: 30 },
            organizationId: 'org-uuid',
            createdBy: 'user-uuid',
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z',
            steps: [
              {
                id: 'step-uuid-1',
                orderIndex: 1,
                title: 'Welcome!',
                content: 'Click here to start',
                targetSelector: '#transfer-button',
                position: 'BOTTOM',
                action: 'CLICK',
                skipAllowed: true,
                highlightElement: true,
              }
            ]
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async findActiveForUrl(
    @Query('url') url: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tours = await this.tourService.findActiveToursForUrl(url, organizationId, user?.id);
    return {
      success: true,
      count: tours.length,
      tours,
    };
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss a tour for current user',
    description: 'Marks this tour as dismissed for the authenticated user only.',
  })
  async dismissForCurrentUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    await this.tourService.setTourUserState(id, organizationId, user.id, TourUserStateStatus.DISMISSED);
    return {
      success: true,
      message: 'Tour dismissed for current user',
    };
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a tour for current user',
    description: 'Marks this tour as completed for the authenticated user only.',
  })
  async completeForCurrentUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    await this.tourService.setTourUserState(id, organizationId, user.id, TourUserStateStatus.COMPLETED);
    return {
      success: true,
      message: 'Tour completed for current user',
    };
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/reset-audience')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset tour audience state',
    description: 'Clears dismissed/completed state for all users of this organization so the tour can be shown again.',
  })
  async resetAudienceState(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const clearedStates = await this.tourService.resetTourAudienceState(id, organizationId);
    return {
      success: true,
      message: 'Tour audience state reset successfully',
      clearedStates,
    };
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/reset-user')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset tour state for one user',
    description: 'Reactivates this tour for a specific user by clearing its user state.',
  })
  async resetUserState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetTourUserDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const clearedStates = await this.tourService.resetTourStateForUser(id, organizationId, body.userId);
    return {
      success: true,
      message: 'Tour state reset for user',
      clearedStates,
    };
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/reset-segment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset tour state for a segment',
    description: 'Reactivates this tour for users matching a segment definition.',
  })
  async resetSegmentState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetTourSegmentDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const result = await this.tourService.resetTourStateForSegment(id, organizationId, body);
    return {
      success: true,
      message: 'Tour state reset for segment',
      ...result,
    };
  }

  @Roles(UserRole.ADMIN)
  @Post('jobs/replay/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run replay eligibility job',
    description: 'Marks expired dismiss/complete states as eligible based on replay policy windows.',
  })
  async runReplayJob(@CurrentUser() user: any) {
    const organizationId = this.getOrganizationId(user);
    const result = await this.tourService.runReplayEligibilityJob(organizationId);
    return {
      success: true,
      message: 'Replay eligibility job executed',
      ...result,
    };
  }

  // Tour details
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Tour details',
    description: 'Returns detailed information about a tour with its steps'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tour found',
    schema: {
      example: {
        success: true,
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'First transfer',
          description: 'Step-by-step guide to make your first bank transfer',
          targetUrl: '/dashboard/transfers',
          isActive: true,
          priority: 10,
          triggerConditions: { minTimeOnPage: 30 },
          organizationId: 'org-uuid',
          createdBy: 'user-uuid',
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-15T10:30:00.000Z',
          steps: [
            {
              id: 'step-uuid-1',
              orderIndex: 1,
              title: 'Welcome!',
              content: 'Click here to start',
              targetSelector: '#transfer-button',
              position: 'BOTTOM',
              action: 'CLICK',
              skipAllowed: true,
              highlightElement: true,
            }
          ]
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Tour not found', schema: {
    example: {
      message: 'Tour not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.findById(id, organizationId);
    return {
      success: true,
      tour,
    };
  }

  // Update a tour (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Update a tour',
    description: 'Updates the information and steps of an existing tour'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tour updated',
    schema: {
      example: {
        success: true,
        message: 'Tour updated successfully',
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'First transfer (modified)',
          description: 'Updated description',
          targetUrl: '/dashboard/transfers',
          isActive: true,
          priority: 20,
          triggerConditions: { minTimeOnPage: 60 },
          organizationId: 'org-uuid',
          createdBy: 'user-uuid',
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-16T14:00:00.000Z',
          steps: []
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Tour not found', schema: {
    example: {
      message: 'Tour not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTourDto: UpdateGuidedTourDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.update(id, updateTourDto, organizationId);
    return {
      success: true,
      message: 'Tour updated successfully',
      tour,
    };
  }

  // Activate/deactivate a tour (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Put(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Activate/deactivate a tour',
    description: 'Changes the active/inactive status of a tour without deleting it'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tour status updated',
    schema: {
      example: {
        success: true,
        message: 'Tour activated',
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'First transfer',
          description: 'Step-by-step guide to make your first bank transfer',
          targetUrl: '/dashboard/transfers',
          isActive: true,
          priority: 10,
          triggerConditions: {},
          organizationId: 'org-uuid',
          createdBy: 'user-uuid',
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-16T14:00:00.000Z',
          steps: []
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Tour not found', schema: {
    example: {
      message: 'Tour not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async toggleActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.toggleActive(id, organizationId, isActive);
    return {
      success: true,
      message: isActive ? 'Tour activated' : 'Tour deactivated',
      tour,
    };
  }

  // Delete a tour (hard delete - ADMIN only)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Delete a tour',
    description: 'Permanently deletes a tour and its steps'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tour deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Tour deleted successfully',
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Tour not found', schema: {
    example: {
      message: 'Tour not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    await this.tourService.delete(id, organizationId);
    return {
      success: true,
      message: 'Tour deleted successfully',
    };
  }

}
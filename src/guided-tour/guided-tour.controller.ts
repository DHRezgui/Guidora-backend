import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, UseGuards, ParseUUIDPipe, Query, BadRequestException, Headers } from '@nestjs/common';
import { TourEnvironment } from './entities/guided-tour.entity';
import { parseTourAudienceHeader } from './guided-tour-user-state.util';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../user/entities/user.entity';
import { GuidedTourService } from './guided-tour.service';
import { CreateGuidedTourDto } from './dto/create-guided-tour.dto';
import { UpdateGuidedTourDto } from './dto/update-guided-tour.dto';
import { RejectSandboxTourDto } from './dto/reject-sandbox-tour.dto';
import { ReturnToDeveloperDto } from './dto/return-to-developer.dto';
import { AssignTourAdminsDto } from './dto/assign-tour-admins.dto';
import { TransferTourDeveloperDto } from './dto/transfer-tour-developer.dto';
import { TransferProductionManagementDto } from './dto/transfer-production-management.dto';
import { SetTourAccessGrantsDto } from './dto/set-tour-access-grants.dto';
import { ResetTourUserDto } from './dto/reset-tour-user.dto';
import { ResetTourSegmentDto } from './dto/reset-tour-segment.dto';
import { GuidedTour } from './entities/guided-tour.entity';
import { TourUserStateStatus } from './entities/tour-user-state.entity';
import { ApiAuth } from '../swagger/security-schemas';
import { PublishContextualDraftsDto } from './dto/publish-contextual-drafts.dto';
import { ContextualFeedbackService } from './contextual-feedback.service';
import { SubmitContextualFeedbackDto } from './dto/submit-contextual-feedback.dto';
import { ContextualSemanticHintsRequestDto } from './dto/contextual-semantic-hints.dto';
import { ContextualJourneyBlueprintService } from './contextual-journey-blueprint.service';
import { UpsertOrganizationJourneyBlueprintDto } from './dto/journey-blueprint.dto';
import { SetBlueprintAccessGrantsDto } from './dto/set-blueprint-access-grants.dto';
import { RequireSdkScopes } from '../auth/decorators/require-sdk-scopes.decorator';
import { AllowSdkScopes } from '../auth/decorators/allow-sdk-scopes.decorator';

@ApiTags('Guided Tour')
@Controller('tours')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class GuidedTourController {
  constructor(
    private readonly tourService: GuidedTourService,
    private readonly contextualFeedbackService: ContextualFeedbackService,
    private readonly journeyBlueprintService: ContextualJourneyBlueprintService,
  ) {}

  private getOrganizationId(user: any): string {
    const organizationId = user?.organizationId || user?.organizations?.[0]?.id;
    if (!organizationId) {
      throw new BadRequestException('Aucune organisation associee a cet utilisateur.');
    }
    return organizationId;
  }

  private parseTourAudienceParam(value?: string): TourEnvironment | undefined {
    return parseTourAudienceHeader(value);
  }

  // Create a tour (ADMIN or DEVELOPER sandbox)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
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
      user,
    );
    return {
      success: true,
      message: 'Tour created successfully',
      tour,
    };
  }

  @RequireSdkScopes('semantic:invoke')
  @Post('contextual/semantic-hints')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compute semantic role hints for SDK candidates',
    description:
      'Read-only inference endpoint backing the SDK hybrid semantic layer. The SDK fuses these hints with its local inference within bounded deltas. Failures or timeouts on the SDK side fall back to local-only inference, so this endpoint is purely additive.',
  })
  @ApiResponse({
    status: 200,
    description: 'Semantic role hints computed successfully',
  })
  async inferContextualSemanticHints(
    @Body() dto: ContextualSemanticHintsRequestDto,
  ) {
    return this.tourService.inferContextualSemanticHints(dto);
  }

  @Roles(UserRole.ADMIN)
  @Post('contextual/semantic-hints/warmup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Warm up the persistent tour semantic Python worker',
    description:
      'Loads sentence-transformers once in a keep-alive worker process. ' +
      'Also runs automatically on backend start when SEMANTIC_TOUR_AUTO_WARMUP=true.',
  })
  @ApiResponse({ status: 200, description: 'Worker warmup status' })
  async warmupContextualSemanticHints() {
    return this.tourService.warmupContextualSemanticEmbeddings();
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @AllowSdkScopes('tours:publish')
  @RequireSdkScopes('tours:publish')
  @Post('contextual/publish')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publish contextual drafts',
    description:
      'Apply quality gates, deduplication and activation policy to SDK contextual drafts. ' +
      'ADMIN and DEVELOPER (dashboard JWT / lab SDK Tests). SDK integration tokens need tours:publish scope.',
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
      user,
    );

    return {
      success: true,
      message: 'Contextual drafts processed successfully',
      report,
    };
  }

  @RequireSdkScopes('feedback:write')
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

  @RequireSdkScopes('blueprints:read')
  @Get('contextual/blueprints/catalog')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Journey blueprint field catalog',
    description: 'Verticals, intents and semantic roles allowed when creating custom blueprints.',
  })
  async getJourneyBlueprintCatalog() {
    const catalog = this.journeyBlueprintService.getCatalogMetadata();
    return { success: true, catalog };
  }

  @RequireSdkScopes('blueprints:read')
  @Get('contextual/blueprints')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Published custom journey blueprints (SDK)',
    description:
      'Returns JourneyBlueprint[] for the authenticated user organization. ' +
      'Merged at runtime after built-ins; does not replace SDK packs.',
  })
  @ApiResponse({ status: 200, description: 'Published blueprints for organization' })
  async getPublishedJourneyBlueprints(@CurrentUser() user: any) {
    const organizationId = this.getOrganizationId(user);
    const blueprints = await this.journeyBlueprintService.listPublishedPayloads(organizationId);
    return {
      success: true,
      count: blueprints.length,
      blueprints,
      organizationId,
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('contextual/blueprints/manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all custom blueprints (dashboard)',
    description: 'Includes draft and published rows for the current organization.',
  })
  async listOrganizationJourneyBlueprints(@CurrentUser() user: any) {
    const organizationId = this.getOrganizationId(user);
    const rows = await this.journeyBlueprintService.listForOrganization(organizationId, user);
    return {
      success: true,
      count: rows.length,
      blueprints: rows,
    };
  }

  @Roles(UserRole.ADMIN)
  @Post('contextual/blueprints')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a custom journey blueprint' })
  async createOrganizationJourneyBlueprint(
    @Body() dto: UpsertOrganizationJourneyBlueprintDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const row = await this.journeyBlueprintService.create(organizationId, user, dto);
    return {
      success: true,
      message: 'Blueprint created',
      blueprint: row,
    };
  }

  @Roles(UserRole.ADMIN)
  @Get('contextual/blueprints/:rowId/manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a blueprint with full access grants (dashboard)' })
  @ApiParam({ name: 'rowId', type: String, format: 'uuid' })
  async getOrganizationJourneyBlueprintForManage(
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const blueprint = await this.journeyBlueprintService.getForManage(rowId, organizationId, user);
    return { success: true, blueprint };
  }

  @Roles(UserRole.ADMIN)
  @Put('contextual/blueprints/:rowId/access-grants')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set blueprint modify/publish grants (owner only)' })
  @ApiParam({ name: 'rowId', type: String, format: 'uuid' })
  async setOrganizationJourneyBlueprintAccessGrants(
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: SetBlueprintAccessGrantsDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const blueprint = await this.journeyBlueprintService.setBlueprintAccessGrants(
      rowId,
      organizationId,
      dto,
      user,
    );
    return {
      success: true,
      message: 'Blueprint access grants updated',
      blueprint,
    };
  }

  @Roles(UserRole.ADMIN)
  @Put('contextual/blueprints/:rowId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a custom journey blueprint' })
  @ApiParam({ name: 'rowId', type: String, format: 'uuid' })
  async updateOrganizationJourneyBlueprint(
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: UpsertOrganizationJourneyBlueprintDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const row = await this.journeyBlueprintService.update(rowId, organizationId, user, dto);
    return {
      success: true,
      message: 'Blueprint updated',
      blueprint: row,
    };
  }

  @Roles(UserRole.ADMIN)
  @Put('contextual/blueprints/:rowId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish or unpublish a custom blueprint' })
  @ApiParam({ name: 'rowId', type: String, format: 'uuid' })
  async publishOrganizationJourneyBlueprint(
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body('isPublished') isPublished: boolean,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const row = await this.journeyBlueprintService.setPublished(
      rowId,
      organizationId,
      user,
      !!isPublished,
    );
    return {
      success: true,
      message: isPublished ? 'Blueprint published' : 'Blueprint unpublished',
      blueprint: row,
    };
  }

  @Roles(UserRole.ADMIN)
  @Delete('contextual/blueprints/:rowId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a custom journey blueprint' })
  @ApiParam({ name: 'rowId', type: String, format: 'uuid' })
  async deleteOrganizationJourneyBlueprint(
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    await this.journeyBlueprintService.remove(rowId, organizationId, user);
    return {
      success: true,
      message: 'Blueprint deleted',
    };
  }

  @Roles(UserRole.ADMIN)
  @Post('contextual/blueprints/:rowId/edit-lock/acquire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acquire exclusive blueprint edit lock' })
  @ApiParam({ name: 'rowId', type: String, format: 'uuid' })
  async acquireBlueprintEditLock(
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const result = await this.journeyBlueprintService.acquireBlueprintEditLock(
      rowId,
      organizationId,
      user,
    );
    return {
      success: true,
      blueprint: result.blueprint,
      editLock: result.editLock,
    };
  }

  @Roles(UserRole.ADMIN)
  @Post('contextual/blueprints/:rowId/edit-lock/renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renew blueprint edit lock heartbeat' })
  @ApiParam({ name: 'rowId', type: String, format: 'uuid' })
  async renewBlueprintEditLock(
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const result = await this.journeyBlueprintService.renewBlueprintEditLock(
      rowId,
      organizationId,
      user,
    );
    return {
      success: true,
      blueprint: result.blueprint,
      editLock: result.editLock,
    };
  }

  @Roles(UserRole.ADMIN)
  @Delete('contextual/blueprints/:rowId/edit-lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release blueprint edit lock' })
  @ApiParam({ name: 'rowId', type: String, format: 'uuid' })
  async releaseBlueprintEditLock(
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    await this.journeyBlueprintService.releaseBlueprintEditLock(rowId, organizationId, user);
    return { success: true };
  }

  @RequireSdkScopes('feedback:read')
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
    @Query('includeSteps') includeSteps?: string,
  ) {
    const organizationId = this.getOrganizationId(user);
    const withSteps = includeSteps !== 'false';
    const tours = await this.tourService.findAllByOrganization(organizationId, user, isActive, withSteps);
    return {
      success: true,
      count: tours.length,
      tours,
    };
  }

  // Find active tours for a URL (for the SDK)
  @RequireSdkScopes('tours:runtime')
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
    const tours = await this.tourService.findActiveToursForUrl(url, organizationId, user?.id, {
      userId: user?.id,
      userRole: user?.role,
      authMethod: user?.authMethod,
      scopes: user?.scopes,
    });
    return {
      success: true,
      count: tours.length,
      tours,
    };
  }

  @RequireSdkScopes('tours:runtime')
  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss a tour for current user',
    description: 'Marks this tour as dismissed for the authenticated user only.',
  })
  async dismissForCurrentUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Headers('x-tour-audience') tourAudienceHeader?: string,
    @Query('audience') tourAudienceQuery?: string,
  ) {
    const organizationId = this.getOrganizationId(user);
    const audience = this.parseTourAudienceParam(tourAudienceHeader ?? tourAudienceQuery);
    await this.tourService.setTourUserState(
      id,
      organizationId,
      user.id,
      TourUserStateStatus.DISMISSED,
      user,
      audience,
    );
    return {
      success: true,
      message: 'Tour dismissed for current user',
    };
  }

  @RequireSdkScopes('tours:runtime')
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a tour for current user',
    description: 'Marks this tour as completed for the authenticated user only.',
  })
  async completeForCurrentUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Headers('x-tour-audience') tourAudienceHeader?: string,
    @Query('audience') tourAudienceQuery?: string,
  ) {
    const organizationId = this.getOrganizationId(user);
    const audience = this.parseTourAudienceParam(tourAudienceHeader ?? tourAudienceQuery);
    await this.tourService.setTourUserState(
      id,
      organizationId,
      user.id,
      TourUserStateStatus.COMPLETED,
      user,
      audience,
    );
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

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('organization-admins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List organization administrators',
    description:
      'Returns active ADMIN users in the current organization (for assigning developer-private tours)',
  })
  async listOrganizationAdmins(@CurrentUser() user: any) {
    const organizationId = this.getOrganizationId(user);
    const admins = await this.tourService.listOrganizationAdmins(organizationId);
    return {
      success: true,
      count: admins.length,
      users: admins.map((admin) => ({
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      })),
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('organization-members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List organization members for tour sharing',
    description:
      'Active ADMIN and DEVELOPER users in the organization (excluding the current user)',
  })
  async listOrganizationMembers(@CurrentUser() user: any) {
    const organizationId = this.getOrganizationId(user);
    const members = await this.tourService.listOrganizationMembers(organizationId, user);
    return {
      success: true,
      count: members.length,
      users: members.map((member) => ({
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
      })),
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Put(':id/access-grants')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set tour access grants',
    description:
      'Share a sandbox tour with organization members (view-only or sandbox collaboration)',
  })
  async setTourAccessGrants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTourAccessGrantsDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.setTourAccessGrants(id, organizationId, dto, user);
    return {
      success: true,
      message: 'Accès au parcours mis à jour',
      tour,
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Post(':id/edit-lock/acquire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Acquire exclusive edit lock',
    description:
      'Required for shared collaboration tours. Prevents concurrent edits by multiple collaborators.',
  })
  async acquireTourEditLock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const result = await this.tourService.acquireTourEditLock(id, organizationId, user);
    return {
      success: true,
      message: 'Verrou d’édition acquis',
      tour: result.tour,
      editLock: result.editLock,
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Post(':id/edit-lock/renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renew edit lock lease',
    description: 'Extends the lock while the editor page remains open',
  })
  async renewTourEditLock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const result = await this.tourService.renewTourEditLock(id, organizationId, user);
    return {
      success: true,
      message: 'Verrou d’édition renouvelé',
      tour: result.tour,
      editLock: result.editLock,
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Delete(':id/edit-lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Release edit lock',
    description: 'Called when leaving the editor so others can acquire the lock',
  })
  async releaseTourEditLock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    await this.tourService.releaseTourEditLock(id, organizationId, user);
    return {
      success: true,
      message: 'Verrou d’édition libéré',
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get(':id/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export tour (sanitized JSON)',
    description:
      'Returns an import-safe tour payload without organization IDs, user grants, or moderation metadata',
  })
  async exportTour(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    const organizationId = this.getOrganizationId(user);
    const exportPayload = await this.tourService.exportTourById(id, organizationId, user);
    return {
      success: true,
      export: exportPayload,
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
    const tour = await this.tourService.findById(id, organizationId, user);
    return {
      success: true,
      tour,
    };
  }

  @Roles(UserRole.DEVELOPER)
  @Put(':id/assign-admins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign tour to administrators',
    description:
      'Developer-only: submits a private tour to selected admins for sandbox moderation',
  })
  async assignTourToAdmins(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTourAdminsDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.assignTourToAdmins(id, organizationId, dto, user);
    return {
      success: true,
      message: 'Parcours assigné aux administrateurs sélectionnés',
      tour,
    };
  }

  @Roles(UserRole.ADMIN)
  @Put(':id/reopen-to-developer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reopen an approved developer tour for revision',
    description:
      'Admin-only: revokes sandbox approval and returns the tour to pending so the developer can edit again',
  })
  async reopenApprovedTourToDeveloper(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() returnDto: ReturnToDeveloperDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.reopenApprovedTourToDeveloper(
      id,
      organizationId,
      returnDto.reason,
      user,
    );
    return {
      success: true,
      message: 'Parcours renvoyé au développeur pour révision',
      tour,
    };
  }

  @Roles(UserRole.ADMIN)
  @Put(':id/reassign-admins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reassign moderation admins on an approved tour',
    description:
      'Admin-only: updates assigned_admin_ids while keeping sandbox approval (handoff between admins)',
  })
  async reassignApprovedTourAdmins(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTourAdminsDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.reassignApprovedTourAdmins(id, organizationId, dto, user);
    return {
      success: true,
      message: 'Modération réassignée aux administrateurs sélectionnés',
      tour,
    };
  }

  @Roles(UserRole.ADMIN)
  @Put(':id/transfer-production-management')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delegate production management to another admin',
    description:
      'Admin-only: tour owner assigns a single production manager; other admins remain read-only',
  })
  async transferProductionManagement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferProductionManagementDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.transferProductionManagement(
      id,
      organizationId,
      dto,
      user,
    );
    return {
      success: true,
      message: 'Gestion production déléguée à l’administrateur sélectionné',
      tour,
    };
  }

  @Put(':id/transfer-developer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Transfer an approved tour to another developer',
    description:
      'Admin-only: changes tour ownership, records audit trail, returns tour to the new developer for revision',
  })
  async transferApprovedTourToDeveloper(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferTourDeveloperDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.transferApprovedTourToDeveloper(
      id,
      organizationId,
      dto,
      user,
    );
    return {
      success: true,
      message: 'Parcours transféré au nouveau développeur',
      tour,
    };
  }

  @Roles(UserRole.ADMIN)
  @Put(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a pending sandbox tour',
    description:
      'Validates a developer sandbox submission (sandboxStatus approved) while keeping environment sandbox. Use environment transfer to promote to production (ADMIN only)',
  })
  async approveSandboxTour(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.approveSandboxTour(id, organizationId, user);
    return {
      success: true,
      message: 'Tour approuvé — reste en sandbox ; promotion prod via le switcher',
      tour,
    };
  }

  @Roles(UserRole.ADMIN)
  @Put(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a pending sandbox tour',
    description: 'Marks a sandbox tour as rejected while keeping it in sandbox (ADMIN only)',
  })
  async rejectSandboxTour(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rejectDto: RejectSandboxTourDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.rejectSandboxTour(
      id,
      organizationId,
      rejectDto.reason,
      user,
    );
    return {
      success: true,
      message: 'Tour sandbox rejeté',
      tour,
    };
  }

  // Update a tour (ADMIN, or DEVELOPER for SDK lab tours only — enforced in service)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
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
    const tour = await this.tourService.update(id, updateTourDto, organizationId, user);
    return {
      success: true,
      message: 'Tour updated successfully',
      tour,
    };
  }

  // Activate/deactivate a tour (ADMIN production, DEVELOPER sandbox test)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
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
    @Body('audience') audience: 'sandbox' | 'production' | undefined,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.toggleActive(id, organizationId, isActive, user, audience);
    return {
      success: true,
      message: isActive ? 'Tour activated' : 'Tour deactivated',
      tour,
    };
  }

  // Delete a tour (ADMIN, or DEVELOPER for SDK lab tours only)
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
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
    await this.tourService.delete(id, organizationId, user);
    return {
      success: true,
      message: 'Tour deleted successfully',
    };
  }

}
import {

  BadRequestException,

  Body,

  Controller,

  Delete,

  Get,

  HttpCode,

  HttpStatus,

  Param,

  ParseUUIDPipe,

  Patch,

  Post,

  Put,

  Query,

  UseGuards,

} from '@nestjs/common';

import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AllowDashboardJwtOnSdkRoute } from '../auth/decorators/allow-dashboard-jwt-on-sdk-route.decorator';

import { AllowSdkScopes } from '../auth/decorators/allow-sdk-scopes.decorator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { RequireSdkScopes } from '../auth/decorators/require-sdk-scopes.decorator';

import { Roles } from '../auth/decorators/roles.decorator';

import { RolesGuard } from '../auth/guards/roles.guard';

import { ApiAuth } from '../swagger/security-schemas';

import { UserRole } from '../user/entities/user.entity';

import {

  CreateSupportTicketDto,

  CreateSupportTicketResponseDto,

  DeleteSupportTicketResponseDto,

  ListSupportTicketsQueryDto,

  ReplySupportTicketDto,

  ReplySupportTicketResponseDto,

  ResolveSupportTicketResponseDto,

  ArchiveSupportTicketResponseDto,

  SetSupportCollaboratorsDto,

  SupportTicketListResponseDto,

  UpdateSupportTicketDto,

  UpdateSupportTicketResponseDto,

} from './dto/support-ticket.dto';

import type { SupportActor } from './support-ticket.permissions';

import { SupportService } from './support.service';



@ApiTags('Support')

@Controller('support')

@UseGuards(RolesGuard)

@ApiAuth()

export class SupportController {

  constructor(private readonly supportService: SupportService) {}



  private getOrganizationId(user: any): string {

    const organizationId = user?.organizationId || user?.organizations?.[0]?.id;

    if (!organizationId) {

      throw new BadRequestException('Aucune organisation associee a cet utilisateur.');

    }

    return organizationId;

  }



  private getActorId(user: any): string | null {

    return user?.id ?? null;

  }



  private getActor(user: any): SupportActor {

    const id = this.getActorId(user);

    if (!id) {

      throw new BadRequestException('Utilisateur non authentifié.');

    }

    const role = user?.role as UserRole;

    if (role !== UserRole.ADMIN && role !== UserRole.DEVELOPER) {

      throw new BadRequestException('Rôle non autorisé pour le support dashboard.');

    }

    return {

      id,

      role,

      email: user?.email ?? null,

      firstName: user?.firstName ?? null,

      lastName: user?.lastName ?? null,

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.USER)

  @AllowSdkScopes('support:write')

  @RequireSdkScopes('support:write')

  @Post('tickets')

  @HttpCode(HttpStatus.CREATED)

  @ApiOperation({ summary: 'Create a support ticket from the SDK help panel' })

  @ApiResponse({ status: 201, type: CreateSupportTicketResponseDto })

  async createTicket(

    @Body() dto: CreateSupportTicketDto,

    @CurrentUser() user: any,

  ): Promise<CreateSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const userId = this.getActorId(user);

    const ticket = await this.supportService.createTicket(organizationId, userId, dto);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Get('tickets')

  @HttpCode(HttpStatus.OK)

  @ApiOperation({ summary: 'List support tickets for the organization (dashboard)' })

  @ApiResponse({ status: 200, type: SupportTicketListResponseDto })

  async listTickets(

    @Query() query: ListSupportTicketsQueryDto,

    @CurrentUser() user: any,

  ): Promise<SupportTicketListResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const { items, count } = await this.supportService.listTicketsForOrganization(

      organizationId,

      actor,

      {

        status: query.status,

        projectKey: query.projectKey,

        activeOnly: query.activeOnly,

        limit: query.limit,

        offset: query.offset,

      },

    );



    return {

      success: true,

      count,

      items: items.map((ticket) => this.supportService.toResponseDto(ticket, actor)),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Get('tickets/:id/history')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Lifecycle / ownership history for a support ticket' })

  async getTicketHistory(

    @Param('id', ParseUUIDPipe) id: string,

    @Query('scope') scope: 'all' | 'assignment' | 'status' | undefined,

    @CurrentUser() user: any,

  ) {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const safeScope =
      scope === 'assignment' || scope === 'status' || scope === 'all' ? scope : 'all';

    const { items, count } = await this.supportService.getTicketHistory(
      organizationId,
      id,
      actor,
      safeScope,
    );

    return { success: true, count, items };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Patch('tickets/:id')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Update ticket status, priority or assignee' })

  @ApiResponse({ status: 200, type: UpdateSupportTicketResponseDto })

  async updateTicket(

    @Param('id', ParseUUIDPipe) id: string,

    @Body() dto: UpdateSupportTicketDto,

    @CurrentUser() user: any,

  ): Promise<UpdateSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.updateTicket(organizationId, id, dto, actor);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Put('tickets/:id/collaborators')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Replace developer collaborators on an assigned ticket' })

  @ApiResponse({ status: 200, type: UpdateSupportTicketResponseDto })

  async setCollaborators(

    @Param('id', ParseUUIDPipe) id: string,

    @Body() dto: SetSupportCollaboratorsDto,

    @CurrentUser() user: any,

  ): Promise<UpdateSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.setCollaborators(

      organizationId,

      id,

      actor,

      dto.collaborators ?? [],

    );

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Post('tickets/:id/edit-lock')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Acquire edit lock (5 min TTL, renewable)' })

  @ApiResponse({ status: 200, type: UpdateSupportTicketResponseDto })

  async acquireEditLock(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: any,

  ): Promise<UpdateSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.acquireEditLock(organizationId, id, actor);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Patch('tickets/:id/edit-lock')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Renew edit lock TTL' })

  @ApiResponse({ status: 200, type: UpdateSupportTicketResponseDto })

  async renewEditLock(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: any,

  ): Promise<UpdateSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.renewEditLock(organizationId, id, actor);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Delete('tickets/:id/edit-lock')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Release edit lock (holder or admin force)' })

  @ApiResponse({ status: 200, type: UpdateSupportTicketResponseDto })

  async releaseEditLock(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: any,

  ): Promise<UpdateSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.releaseEditLock(organizationId, id, actor);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Post('tickets/:id/reply')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Send an email reply to the ticket contact' })

  @ApiResponse({ status: 200, type: ReplySupportTicketResponseDto })

  async replyTicket(

    @Param('id', ParseUUIDPipe) id: string,

    @Body() dto: ReplySupportTicketDto,

    @CurrentUser() user: any,

  ): Promise<ReplySupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.replyTicket(organizationId, id, dto, actor);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Patch('tickets/:id/resolve')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Mark a support ticket as resolved' })

  @ApiResponse({ status: 200, type: ResolveSupportTicketResponseDto })

  async resolveTicket(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: any,

  ): Promise<ResolveSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.resolveTicket(organizationId, id, actor);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Patch('tickets/:id/archive')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Archive a ticket (CLOSED, no requester email)' })

  @ApiResponse({ status: 200, type: ArchiveSupportTicketResponseDto })

  async archiveTicket(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: any,

  ): Promise<ArchiveSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.archiveTicket(organizationId, id, actor);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Patch('tickets/:id/unarchive')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Unarchive a ticket (CLOSED → IN_PROGRESS or OPEN)' })

  @ApiResponse({ status: 200, type: ArchiveSupportTicketResponseDto })

  async unarchiveTicket(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: any,

  ): Promise<ArchiveSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.unarchiveTicket(organizationId, id, actor);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @AllowDashboardJwtOnSdkRoute()

  @Patch('tickets/:id/reopen')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Reopen a resolved ticket (RESOLVED → IN_PROGRESS or OPEN)' })

  @ApiResponse({ status: 200, type: ArchiveSupportTicketResponseDto })

  async reopenTicket(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: any,

  ): Promise<ArchiveSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    const ticket = await this.supportService.reopenTicket(organizationId, id, actor);

    return {

      success: true,

      ticket: this.supportService.toResponseDto(ticket, actor),

    };

  }



  /** Org ADMIN only — SUPER_ADMIN manages platform orgs, not day-to-day support. */

  @Roles(UserRole.ADMIN)

  @AllowDashboardJwtOnSdkRoute()

  @Delete('tickets/:id')

  @HttpCode(HttpStatus.OK)

  @ApiParam({ name: 'id', type: String, format: 'uuid' })

  @ApiOperation({ summary: 'Soft-delete a support ticket (org ADMIN)' })

  @ApiResponse({ status: 200, type: DeleteSupportTicketResponseDto })

  async deleteTicket(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: any,

  ): Promise<DeleteSupportTicketResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const actor = this.getActor(user);

    await this.supportService.softDeleteTicket(organizationId, id, actor);

    return { success: true };

  }

}



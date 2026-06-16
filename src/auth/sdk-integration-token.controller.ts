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
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from './decorators/roles.decorator';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { CreateSdkIntegrationTokenDto } from './dto/create-sdk-integration-token.dto';
import { SdkIntegrationTokenService } from './sdk-integration-token.service';
import { SdkSessionTokenService } from './sdk-session-token.service';
import { SdkIntegrationTokenAuditService } from './sdk-integration-token-audit.service';
import { SDK_TOKEN_PREFIX } from './sdk-token-scopes';
import { UserRole } from '../user/entities/user.entity';
import { ApiAuth } from '../swagger/security-schemas';
import type { RequestAuthUser } from './types/request-auth-user.type';
import type { SdkTokenAuditContext } from './sdk-integration-token-audit.service';

@ApiTags('Auth — SDK integration tokens')
@Controller('auth/sdk-tokens')
@ApiAuth()
export class SdkIntegrationTokenController {
  constructor(
    private readonly sdkTokenService: SdkIntegrationTokenService,
    private readonly sdkSessionTokenService: SdkSessionTokenService,
    private readonly auditService: SdkIntegrationTokenAuditService,
  ) {}

  private resolveAuditContext(req: Request): SdkTokenAuditContext {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ||
      req.ip ||
      null;
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    return { ip, userAgent };
  }

  private resolveOrgId(user: RequestAuthUser & { organizations?: { id: string }[] }): string {
    const organizationId = user?.organizationId || user?.organizations?.[0]?.id;
    if (!organizationId) {
      throw new BadRequestException('Aucune organisation associée à cet utilisateur.');
    }
    return organizationId;
  }

  @Get('catalog')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List assignable SDK token scopes' })
  getCatalog() {
    const catalog = this.sdkTokenService.listCatalogScopes();
    return { success: true, catalog };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List SDK integration tokens for the current user (no secrets)' })
  async list(@CurrentUser() user: RequestAuthUser) {
    const organizationId = this.resolveOrgId(user as RequestAuthUser & { organizations?: { id: string }[] });
    const tokens = await this.sdkTokenService.listForCreator(organizationId, user.id);
    return { success: true, count: tokens.length, tokens };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get('audit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recent SDK token audit events for the current user' })
  async listAudit(
    @CurrentUser() user: RequestAuthUser,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.resolveOrgId(user as RequestAuthUser & { organizations?: { id: string }[] });
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 100;
    const events = await this.auditService.listForCreator(organizationId, user.id, parsedLimit);
    return {
      success: true,
      count: events.length,
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        tokenId: event.tokenId,
        sessionTokenId: event.sessionTokenId,
        actorUserId: event.actorUserId,
        ip: event.ip,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  @Public()
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange integration PAT for a short-lived browser session token (BFF)',
    description:
      'Server-side only: send `Authorization: Bearer td_sdk_...`. Returns `td_sess_...` (15 min) with browser-safe scopes (no tours:publish).',
  })
  async exchangeSession(@Req() req: Request) {
    const authHeader = req.headers?.authorization;
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new BadRequestException('Authorization Bearer td_sdk_... required');
    }
    const bearer = authHeader.slice(7).trim();
    if (!bearer.startsWith(SDK_TOKEN_PREFIX)) {
      throw new BadRequestException('Only integration PAT (td_sdk_...) can be exchanged');
    }
    const session = await this.sdkSessionTokenService.exchangeFromIntegrationPat(
      bearer,
      this.resolveAuditContext(req),
    );
    return {
      success: true,
      message: 'Session token issued for browser SDK (short-lived).',
      ...session,
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an SDK integration token',
    description:
      'Returns the plaintext token once. Store it immediately — it cannot be retrieved again.',
  })
  @ApiResponse({ status: 201, description: 'Token created; plaintext token in body' })
  async create(
    @Body() dto: CreateSdkIntegrationTokenDto,
    @CurrentUser() user: RequestAuthUser & { role: UserRole },
    @Req() req: Request,
  ) {
    const organizationId = this.resolveOrgId(user as RequestAuthUser & { organizations?: { id: string }[] });
    const result = await this.sdkTokenService.create(
      organizationId,
      user.id,
      user.role as UserRole,
      dto.name,
      dto.scopes,
      dto.expiresInDays,
      this.resolveAuditContext(req),
    );
    return {
      success: true,
      message:
        'Token created. Copy it now — it will not be shown again.',
      token: result.token,
      tokenRecord: result.record,
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Delete('revoked-history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Purge revoked SDK tokens from organization history',
    description: 'Hard-deletes all revoked tokens for the organization (optional manual cleanup).',
  })
  async purgeRevokedHistory(@CurrentUser() user: RequestAuthUser) {
    const organizationId = this.resolveOrgId(user as RequestAuthUser & { organizations?: { id: string }[] });
    const deletedCount = await this.sdkTokenService.purgeRevokedHistory(organizationId, user.id);
    return {
      success: true,
      message: 'Revoked token history purged',
      deletedCount,
    };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a revoked SDK token from history',
    description: 'Hard-deletes a single revoked token record.',
  })
  async removeRevokedFromHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestAuthUser,
  ) {
    const organizationId = this.resolveOrgId(user as RequestAuthUser & { organizations?: { id: string }[] });
    await this.sdkTokenService.removeRevokedFromHistory(id, organizationId, user.id);
    return { success: true, message: 'Revoked token removed from history' };
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an SDK integration token' })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestAuthUser,
    @Req() req: Request,
  ) {
    const organizationId = this.resolveOrgId(user as RequestAuthUser & { organizations?: { id: string }[] });
    await this.sdkTokenService.revoke(id, organizationId, user.id, this.resolveAuditContext(req));
    return { success: true, message: 'Token revoked' };
  }
}

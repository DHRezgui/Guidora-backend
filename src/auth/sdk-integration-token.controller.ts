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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { CreateSdkIntegrationTokenDto } from './dto/create-sdk-integration-token.dto';
import { SdkIntegrationTokenService } from './sdk-integration-token.service';
import { UserRole } from '../user/entities/user.entity';
import { ApiAuth } from '../swagger/security-schemas';
import type { RequestAuthUser } from './types/request-auth-user.type';

@ApiTags('Auth — SDK integration tokens')
@Controller('auth/sdk-tokens')
@ApiAuth()
export class SdkIntegrationTokenController {
  constructor(private readonly sdkTokenService: SdkIntegrationTokenService) {}

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
  @ApiOperation({ summary: 'List SDK integration tokens for the organization (no secrets)' })
  async list(@CurrentUser() user: RequestAuthUser) {
    const organizationId = this.resolveOrgId(user as RequestAuthUser & { organizations?: { id: string }[] });
    const tokens = await this.sdkTokenService.listForOrganization(organizationId);
    return { success: true, count: tokens.length, tokens };
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
  ) {
    const organizationId = this.resolveOrgId(user as RequestAuthUser & { organizations?: { id: string }[] });
    const result = await this.sdkTokenService.create(
      organizationId,
      user.id,
      user.role as UserRole,
      dto.name,
      dto.scopes,
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
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an SDK integration token' })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestAuthUser,
  ) {
    const organizationId = this.resolveOrgId(user as RequestAuthUser & { organizations?: { id: string }[] });
    await this.sdkTokenService.revoke(id, organizationId);
    return { success: true, message: 'Token revoked' };
  }
}

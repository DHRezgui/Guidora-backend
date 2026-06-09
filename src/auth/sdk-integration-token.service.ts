import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { SdkIntegrationToken } from './entities/sdk-integration-token.entity';
import {
  SDK_TOKEN_PREFIX,
  SDK_TOKEN_SCOPES,
  SdkTokenScope,
  normalizeRequestedScopes,
} from './sdk-token-scopes';
import type { RequestAuthUser } from './types/request-auth-user.type';
import { UserRole } from '../user/entities/user.entity';

export interface SdkIntegrationTokenListItem {
  id: string;
  name: string;
  tokenSuffix: string;
  scopes: SdkTokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}

@Injectable()
export class SdkIntegrationTokenService {
  constructor(
    @InjectRepository(SdkIntegrationToken)
    private readonly repo: Repository<SdkIntegrationToken>,
  ) {}

  listCatalogScopes(): { scopes: readonly SdkTokenScope[]; adminOnly: SdkTokenScope[] } {
    return {
      scopes: SDK_TOKEN_SCOPES,
      adminOnly: ['tours:publish', 'blueprints:manage'],
    };
  }

  async listForOrganization(organizationId: string): Promise<SdkIntegrationTokenListItem[]> {
    const rows = await this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toListItem(row));
  }

  async create(
    organizationId: string,
    creatorId: string,
    creatorRole: UserRole,
    name: string,
    requestedScopes?: string[],
  ): Promise<{ token: string; record: SdkIntegrationTokenListItem }> {
    if (!organizationId) {
      throw new BadRequestException('Organization is required to create an integration token.');
    }
    if (creatorRole === UserRole.USER) {
      throw new ForbiddenException('Only ADMIN or DEVELOPER can create SDK integration tokens.');
    }

    const scopes = normalizeRequestedScopes(requestedScopes, creatorRole);
    const secret = randomBytes(32).toString('base64url');
    const plainToken = `${SDK_TOKEN_PREFIX}${secret}`;
    const tokenHash = this.hashToken(plainToken);
    const tokenSuffix = secret.slice(-8);

    const row = await this.repo.save(
      this.repo.create({
        organizationId,
        createdBy: creatorId,
        name: name.trim(),
        tokenHash,
        tokenSuffix,
        scopes,
      }),
    );

    return {
      token: plainToken,
      record: this.toListItem(row),
    };
  }

  async revoke(id: string, organizationId: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    if (!row) {
      throw new NotFoundException('Integration token not found');
    }
    if (row.revokedAt) {
      return;
    }
    row.revokedAt = new Date();
    await this.repo.save(row);
  }

  /**
   * Validates `Authorization: Bearer td_sdk_...` and returns principal for request.user.
   */
  async validateBearerToken(bearerValue: string): Promise<RequestAuthUser | null> {
    const raw = bearerValue.startsWith('Bearer ') ? bearerValue.slice(7).trim() : bearerValue.trim();
    if (!raw.startsWith(SDK_TOKEN_PREFIX)) {
      return null;
    }

    const tokenHash = this.hashToken(raw);
    const row = await this.repo.findOne({ where: { tokenHash } });
    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked SDK integration token');
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('SDK integration token expired');
    }

    void this.repo.update(row.id, { lastUsedAt: new Date() });

    return {
      id: row.createdBy,
      role: 'SDK_TOKEN',
      organizationId: row.organizationId,
      authMethod: 'sdk_token',
      sdkTokenId: row.id,
      scopes: row.scopes.filter((s): s is SdkTokenScope =>
        (SDK_TOKEN_SCOPES as readonly string[]).includes(s),
      ),
    };
  }

  private hashToken(plain: string): string {
    return createHash('sha256').update(plain, 'utf8').digest('hex');
  }

  private toListItem(row: SdkIntegrationToken): SdkIntegrationTokenListItem {
    return {
      id: row.id,
      name: row.name,
      tokenSuffix: row.tokenSuffix,
      scopes: row.scopes as SdkTokenScope[],
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }
}

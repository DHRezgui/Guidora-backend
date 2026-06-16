import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Not, Repository } from 'typeorm';
import { SdkIntegrationToken } from './entities/sdk-integration-token.entity';
import {
  ADMIN_ONLY_SDK_SCOPES,
  SDK_TOKEN_PREFIX,
  SDK_TOKEN_SCOPES,
  SdkTokenScope,
  normalizeRequestedScopes,
} from './sdk-token-scopes';
import type { RequestAuthUser } from './types/request-auth-user.type';
import { UserRole } from '../user/entities/user.entity';
import {
  DEFAULT_SDK_TOKEN_TTL_DAYS,
  resolveSdkTokenExpiresAt,
} from './sdk-token-lifecycle.constants';
import {
  SdkIntegrationTokenAuditService,
  type SdkTokenAuditContext,
} from './sdk-integration-token-audit.service';

/** Durée d'affichage des tokens révoqués dans la liste dashboard (historique récent). */
export const REVOKED_SDK_TOKEN_LIST_RETENTION_DAYS = 30;

const REVOKED_SDK_TOKEN_LIST_RETENTION_MS =
  REVOKED_SDK_TOKEN_LIST_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function isSdkTokenVisibleInList(
  revokedAt: Date | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!revokedAt) {
    return true;
  }
  return nowMs - revokedAt.getTime() <= REVOKED_SDK_TOKEN_LIST_RETENTION_MS;
}

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
    private readonly auditService: SdkIntegrationTokenAuditService,
  ) {}

  listCatalogScopes(): { scopes: readonly SdkTokenScope[]; adminOnly: SdkTokenScope[] } {
    return {
      scopes: SDK_TOKEN_SCOPES,
      adminOnly: [...ADMIN_ONLY_SDK_SCOPES],
    };
  }

  async listForCreator(
    organizationId: string,
    creatorId: string,
  ): Promise<SdkIntegrationTokenListItem[]> {
    const rows = await this.repo.find({
      where: { organizationId, createdBy: creatorId },
      order: { createdAt: 'DESC' },
    });
    return rows
      .filter((row) => isSdkTokenVisibleInList(row.revokedAt))
      .map((row) => this.toListItem(row));
  }

  /** @deprecated Prefer {@link listForCreator} — tokens are scoped per creator account. */
  async listForOrganization(organizationId: string): Promise<SdkIntegrationTokenListItem[]> {
    const rows = await this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
    return rows
      .filter((row) => isSdkTokenVisibleInList(row.revokedAt))
      .map((row) => this.toListItem(row));
  }

  async create(
    organizationId: string,
    creatorId: string,
    creatorRole: UserRole,
    name: string,
    requestedScopes?: string[],
    expiresInDays: number = DEFAULT_SDK_TOKEN_TTL_DAYS,
    auditContext?: SdkTokenAuditContext,
  ): Promise<{ token: string; record: SdkIntegrationTokenListItem }> {
    if (!organizationId) {
      throw new BadRequestException('Organization is required to create an integration token.');
    }
    if (creatorRole === UserRole.USER) {
      throw new ForbiddenException('Only ADMIN or DEVELOPER can create SDK integration tokens.');
    }

    const scopes = normalizeRequestedScopes(requestedScopes, creatorRole);
    const expiresAt = resolveSdkTokenExpiresAt(expiresInDays);
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
        expiresAt,
      }),
    );

    await this.auditService.record({
      organizationId,
      eventType: 'created',
      tokenId: row.id,
      actorUserId: creatorId,
      metadata: { name: row.name, scopes, expiresAt: expiresAt.toISOString() },
      context: auditContext,
    });

    return {
      token: plainToken,
      record: this.toListItem(row),
    };
  }

  async revoke(
    id: string,
    organizationId: string,
    actorUserId: string,
    auditContext?: SdkTokenAuditContext,
  ): Promise<void> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    if (!row) {
      throw new NotFoundException('Integration token not found');
    }
    if (row.createdBy !== actorUserId) {
      throw new ForbiddenException('Vous ne pouvez révoquer que vos propres tokens SDK.');
    }
    if (row.revokedAt) {
      return;
    }
    row.revokedAt = new Date();
    await this.repo.save(row);
    await this.auditService.record({
      organizationId,
      eventType: 'revoked',
      tokenId: row.id,
      actorUserId,
      metadata: { name: row.name, tokenSuffix: row.tokenSuffix },
      context: auditContext,
    });
  }

  async removeRevokedFromHistory(
    id: string,
    organizationId: string,
    actorUserId: string,
  ): Promise<void> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    if (!row) {
      throw new NotFoundException('Integration token not found');
    }
    if (row.createdBy !== actorUserId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres tokens SDK.');
    }
    if (!row.revokedAt) {
      throw new BadRequestException(
        'Seuls les tokens déjà révoqués peuvent être supprimés de l’historique.',
      );
    }
    await this.repo.remove(row);
  }

  async purgeRevokedHistory(organizationId: string, actorUserId: string): Promise<number> {
    const result = await this.repo.delete({
      organizationId,
      createdBy: actorUserId,
      revokedAt: Not(IsNull()),
    });
    return result.affected ?? 0;
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

    const shouldLogUsage =
      !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 15 * 60 * 1000;
    void this.repo.update(row.id, { lastUsedAt: new Date() });
    if (shouldLogUsage) {
      void this.auditService.record({
        organizationId: row.organizationId,
        eventType: 'used',
        tokenId: row.id,
        actorUserId: row.createdBy,
        metadata: { tokenSuffix: row.tokenSuffix },
      });
    }

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

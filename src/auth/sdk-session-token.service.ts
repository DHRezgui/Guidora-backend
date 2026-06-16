import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { SdkSessionToken } from './entities/sdk-session-token.entity';
import { SdkIntegrationToken } from './entities/sdk-integration-token.entity';
import {
  DEFAULT_SDK_SESSION_TTL_SECONDS,
  SDK_SESSION_TOKEN_PREFIX,
  intersectPatScopesWithBrowserSession,
} from './sdk-token-lifecycle.constants';
import {
  SDK_TOKEN_SCOPES,
  SdkTokenScope,
} from './sdk-token-scopes';
import type { RequestAuthUser } from './types/request-auth-user.type';
import { SdkIntegrationTokenAuditService, type SdkTokenAuditContext } from './sdk-integration-token-audit.service';

export interface SdkSessionExchangeResult {
  sessionToken: string;
  expiresAt: string;
  expiresIn: number;
  scopes: SdkTokenScope[];
}

@Injectable()
export class SdkSessionTokenService {
  constructor(
    @InjectRepository(SdkSessionToken)
    private readonly sessionRepo: Repository<SdkSessionToken>,
    @InjectRepository(SdkIntegrationToken)
    private readonly patRepo: Repository<SdkIntegrationToken>,
    private readonly auditService: SdkIntegrationTokenAuditService,
  ) {}

  async exchangeFromIntegrationPat(
    plainPat: string,
    context?: SdkTokenAuditContext,
  ): Promise<SdkSessionExchangeResult> {
    const patRow = await this.resolveActivePatRow(plainPat);
    const patScopes = patRow.scopes.filter((scope): scope is SdkTokenScope =>
      (SDK_TOKEN_SCOPES as readonly string[]).includes(scope),
    );
    const sessionScopes = intersectPatScopesWithBrowserSession(patScopes);
    if (sessionScopes.length === 0) {
      throw new ForbiddenException(
        'Ce PAT ne possède aucun scope utilisable en session navigateur (runtime, feedback, etc.).',
      );
    }

    const secret = randomBytes(32).toString('base64url');
    const sessionToken = `${SDK_SESSION_TOKEN_PREFIX}${secret}`;
    const expiresAt = new Date(Date.now() + DEFAULT_SDK_SESSION_TTL_SECONDS * 1000);

    const row = await this.sessionRepo.save(
      this.sessionRepo.create({
        parentTokenId: patRow.id,
        organizationId: patRow.organizationId,
        createdBy: patRow.createdBy,
        tokenHash: this.hashToken(sessionToken),
        tokenSuffix: secret.slice(-8),
        scopes: sessionScopes,
        expiresAt,
      }),
    );

    await this.auditService.record({
      organizationId: patRow.organizationId,
      eventType: 'exchanged',
      tokenId: patRow.id,
      sessionTokenId: row.id,
      actorUserId: patRow.createdBy,
      metadata: { scopes: sessionScopes, expiresIn: DEFAULT_SDK_SESSION_TTL_SECONDS },
      context,
    });

    return {
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      expiresIn: DEFAULT_SDK_SESSION_TTL_SECONDS,
      scopes: sessionScopes,
    };
  }

  async validateBearerToken(bearerValue: string): Promise<RequestAuthUser | null> {
    const raw = bearerValue.startsWith('Bearer ')
      ? bearerValue.slice(7).trim()
      : bearerValue.trim();
    if (!raw.startsWith(SDK_SESSION_TOKEN_PREFIX)) {
      return null;
    }

    const row = await this.sessionRepo.findOne({
      where: { tokenHash: this.hashToken(raw) },
    });
    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked SDK session token');
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('SDK session token expired');
    }

    const shouldLogUsage =
      !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 15 * 60 * 1000;
    void this.sessionRepo.update(row.id, { lastUsedAt: new Date() });
    if (shouldLogUsage) {
      void this.auditService.record({
        organizationId: row.organizationId,
        eventType: 'session_used',
        tokenId: row.parentTokenId,
        sessionTokenId: row.id,
        actorUserId: row.createdBy,
        metadata: { tokenSuffix: row.tokenSuffix },
      });
    }

    return {
      id: row.createdBy,
      role: 'SDK_TOKEN',
      organizationId: row.organizationId,
      authMethod: 'sdk_session',
      sdkTokenId: row.parentTokenId,
      sdkSessionTokenId: row.id,
      scopes: row.scopes.filter((scope): scope is SdkTokenScope =>
        (SDK_TOKEN_SCOPES as readonly string[]).includes(scope),
      ),
    };
  }

  private async resolveActivePatRow(plainPat: string): Promise<SdkIntegrationToken> {
    const tokenHash = this.hashToken(plainPat);
    const row = await this.patRepo.findOne({ where: { tokenHash } });
    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked SDK integration token');
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('SDK integration token expired');
    }
    return row;
  }

  private hashToken(plain: string): string {
    return createHash('sha256').update(plain, 'utf8').digest('hex');
  }
}

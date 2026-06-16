import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SdkIntegrationTokenAudit,
  type SdkIntegrationTokenAuditEvent,
} from './entities/sdk-integration-token-audit.entity';
import { SdkIntegrationToken } from './entities/sdk-integration-token.entity';

export type SdkTokenAuditContext = {
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class SdkIntegrationTokenAuditService {
  constructor(
    @InjectRepository(SdkIntegrationTokenAudit)
    private readonly repo: Repository<SdkIntegrationTokenAudit>,
    @InjectRepository(SdkIntegrationToken)
    private readonly tokenRepo: Repository<SdkIntegrationToken>,
  ) {}

  async record(params: {
    organizationId: string;
    eventType: SdkIntegrationTokenAuditEvent;
    tokenId?: string | null;
    sessionTokenId?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
    context?: SdkTokenAuditContext;
  }): Promise<void> {
    await this.repo.save(
      this.repo.create({
        organizationId: params.organizationId,
        tokenId: params.tokenId ?? null,
        sessionTokenId: params.sessionTokenId ?? null,
        actorUserId: params.actorUserId ?? null,
        eventType: params.eventType,
        ip: params.context?.ip ?? null,
        userAgent: params.context?.userAgent ?? null,
        metadata: params.metadata ?? {},
      }),
    );
  }

  async listForCreator(
    organizationId: string,
    creatorId: string,
    limit = 100,
  ): Promise<SdkIntegrationTokenAudit[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const ownedTokens = await this.tokenRepo.find({
      where: { organizationId, createdBy: creatorId },
      select: ['id'],
    });
    const tokenIds = ownedTokens.map((token) => token.id);
    if (tokenIds.length === 0) {
      return [];
    }
    return this.repo.find({
      where: { organizationId, tokenId: In(tokenIds) },
      order: { createdAt: 'DESC' },
      take: safeLimit,
    });
  }

  async listForOrganization(
    organizationId: string,
    limit = 100,
  ): Promise<SdkIntegrationTokenAudit[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}

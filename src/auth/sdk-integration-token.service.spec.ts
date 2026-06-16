import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SdkIntegrationTokenAuditService } from './sdk-integration-token-audit.service';
import { SdkIntegrationToken } from './entities/sdk-integration-token.entity';
import {
  REVOKED_SDK_TOKEN_LIST_RETENTION_DAYS,
  SdkIntegrationTokenService,
  isSdkTokenVisibleInList,
} from './sdk-integration-token.service';
import { normalizeRequestedScopes } from './sdk-token-scopes';

describe('isSdkTokenVisibleInList', () => {
  const now = new Date('2026-06-04T12:00:00.000Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  it('keeps active tokens visible', () => {
    expect(isSdkTokenVisibleInList(null, now)).toBe(true);
  });

  it('keeps recently revoked tokens visible', () => {
    const revokedAt = new Date(now - 10 * dayMs);
    expect(isSdkTokenVisibleInList(revokedAt, now)).toBe(true);
  });

  it('hides revoked tokens older than retention window', () => {
    const revokedAt = new Date(
      now - (REVOKED_SDK_TOKEN_LIST_RETENTION_DAYS + 1) * dayMs,
    );
    expect(isSdkTokenVisibleInList(revokedAt, now)).toBe(false);
  });

  it('keeps tokens revoked exactly at retention boundary', () => {
    const revokedAt = new Date(now - REVOKED_SDK_TOKEN_LIST_RETENTION_DAYS * dayMs);
    expect(isSdkTokenVisibleInList(revokedAt, now)).toBe(true);
  });
});

describe('normalizeRequestedScopes', () => {
  it('returns defaults when scopes omitted for developer', () => {
    const scopes = normalizeRequestedScopes(undefined, 'DEVELOPER');
    expect(scopes).toContain('blueprints:read');
    expect(scopes).not.toContain('tours:publish');
  });

  it('allows developers to request tours:publish for sandbox SDK publish', () => {
    const scopes = normalizeRequestedScopes(
      ['blueprints:read', 'tours:publish'],
      'DEVELOPER',
    );
    expect(scopes).toEqual(['blueprints:read', 'tours:publish']);
  });

  it('allows tours:publish for admin', () => {
    const scopes = normalizeRequestedScopes(['tours:publish', 'blueprints:read'], 'ADMIN');
    expect(scopes).toContain('tours:publish');
  });
});

describe('SdkIntegrationTokenService revoked history cleanup', () => {
  let service: SdkIntegrationTokenService;
  let repo: jest.Mocked<
    Pick<Repository<SdkIntegrationToken>, 'findOne' | 'remove' | 'delete'>
  >;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SdkIntegrationTokenService,
        {
          provide: getRepositoryToken(SdkIntegrationToken),
          useValue: repo,
        },
        {
          provide: SdkIntegrationTokenAuditService,
          useValue: { record: jest.fn(), listForOrganization: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SdkIntegrationTokenService);
  });

  describe('removeRevokedFromHistory', () => {
    it('hard-deletes a revoked token', async () => {
      const row = {
        id: 'token-1',
        organizationId: 'org-1',
        createdBy: 'user-1',
        revokedAt: new Date(),
      } as SdkIntegrationToken;
      repo.findOne.mockResolvedValue(row);
      repo.remove.mockResolvedValue(row);

      await service.removeRevokedFromHistory('token-1', 'org-1', 'user-1');

      expect(repo.remove).toHaveBeenCalledWith(row);
    });

    it('rejects deletion of active tokens', async () => {
      repo.findOne.mockResolvedValue({
        id: 'token-1',
        organizationId: 'org-1',
        createdBy: 'user-1',
        revokedAt: null,
      } as SdkIntegrationToken);

      await expect(
        service.removeRevokedFromHistory('token-1', 'org-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('throws when token is missing', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.removeRevokedFromHistory('missing', 'org-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects deletion of another user token', async () => {
      repo.findOne.mockResolvedValue({
        id: 'token-1',
        organizationId: 'org-1',
        createdBy: 'other-user',
        revokedAt: new Date(),
      } as SdkIntegrationToken);

      await expect(
        service.removeRevokedFromHistory('token-1', 'org-1', 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });

  describe('purgeRevokedHistory', () => {
    it('deletes all revoked tokens for the creator', async () => {
      repo.delete.mockResolvedValue({ affected: 3, raw: [] });

      const deletedCount = await service.purgeRevokedHistory('org-1', 'user-1');

      expect(deletedCount).toBe(3);
      expect(repo.delete).toHaveBeenCalled();
    });

    it('returns zero when nothing was deleted', async () => {
      repo.delete.mockResolvedValue({ affected: 0, raw: [] });

      const deletedCount = await service.purgeRevokedHistory('org-1', 'user-1');

      expect(deletedCount).toBe(0);
    });
  });
});

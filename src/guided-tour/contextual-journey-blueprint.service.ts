import {

  BadRequestException,

  ConflictException,

  Injectable,

  NotFoundException,

} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { User } from '../user/entities/user.entity';

import { UserRole } from '../user/entities/user.entity';

import { OrganizationJourneyBlueprint } from './entities/organization-journey-blueprint.entity';

import {

  BlueprintAccessMode,

  OrganizationJourneyBlueprintAccessGrant,

} from './entities/organization-journey-blueprint-access-grant.entity';

import {

  JOURNEY_STEP_SEMANTIC_ROLES,

  JOURNEY_VERTICALS,

  TOUR_DRAFT_INTENTS,

  validateJourneyBlueprintPayload,

} from './journey-blueprint-catalog';

import { UpsertOrganizationJourneyBlueprintDto } from './dto/journey-blueprint.dto';

import { SetBlueprintAccessGrantsDto } from './dto/set-blueprint-access-grants.dto';

import {

  assertBlueprintEditLockHeldForSave,

  assertBlueprintDeleteBlockedWhileEditing,
  assertBlueprintPublishBlockedWhileEditedByOther,

  assertCanAcquireBlueprintEditLock,

  BLUEPRINT_EDIT_LOCK_TTL_MS,

  buildBlueprintEditLockConflictMessage,

  buildBlueprintEditLockInfo,

  BlueprintEditLockInfo,

  hasActiveBlueprintEditLock,

  isBlueprintEditLockExpired,

  isBlueprintEditLockHeldBy,

} from './blueprint-edit-lock.util';

import {

  assertCanManageBlueprintAccess,

  assertCanModifyBlueprint,

  assertCanPublishBlueprint,

  blueprintSharingHasMode,

} from './blueprint-access.util';

import {

  assertCanDeleteBlueprint,

  assertCanManageBlueprints,

  BlueprintPermissionActor,

} from './blueprint-permissions.util';

import { FaqEntryService } from '../faq/faq-entry.service';

import { normalizeFaqProjectKey } from '../faq/faq-project-key.util';



@Injectable()

export class ContextualJourneyBlueprintService {

  constructor(

    @InjectRepository(OrganizationJourneyBlueprint)

    private readonly blueprintRepo: Repository<OrganizationJourneyBlueprint>,

    @InjectRepository(OrganizationJourneyBlueprintAccessGrant)

    private readonly accessGrantRepo: Repository<OrganizationJourneyBlueprintAccessGrant>,

    @InjectRepository(User)

    private readonly userRepository: Repository<User>,

    private readonly faqEntryService: FaqEntryService,

  ) {}



  private assertValidPayload(payload: Record<string, unknown>): Record<string, unknown> {

    const result = validateJourneyBlueprintPayload(payload);

    if (!result.valid) {

      throw new BadRequestException({

        message: 'Invalid JourneyBlueprint payload',

        errors: result.errors,

      });

    }

    return payload;

  }



  private async loadUserDisplayName(userId: string): Promise<string | undefined> {

    const user = await this.userRepository.findOne({

      where: { id: userId },

      select: ['id', 'firstName', 'lastName', 'email'],

    });

    if (!user) {

      return undefined;

    }

    const full = `${user.firstName || ''} ${user.lastName || ''}`.trim();

    return full || user.email;

  }



  private async attachEditLockToBlueprint(

    row: OrganizationJourneyBlueprint,

    actor?: BlueprintPermissionActor,

  ): Promise<void> {

    let holderDisplayName: string | undefined;

    if (row.editLockedBy && !isBlueprintEditLockExpired(row.editLockExpiresAt)) {

      holderDisplayName = await this.loadUserDisplayName(row.editLockedBy);

    }

    row.editLock = buildBlueprintEditLockInfo(row, actor?.id, holderDisplayName);

  }



  private async loadAccessGrantsForBlueprint(

    blueprintRowId: string,

  ): Promise<OrganizationJourneyBlueprintAccessGrant[]> {

    const grants = await this.accessGrantRepo.find({

      where: { blueprintRowId },

      order: { createdAt: 'ASC' },

    });

    if (grants.length === 0) {

      return [];

    }

    const users = await this.userRepository.find({

      where: { id: In(grants.map((g) => g.userId)) },

    });

    const usersById = new Map(users.map((u) => [u.id, u]));

    return grants.map((grant) => ({

      ...grant,

      user: usersById.get(grant.userId),

    }));

  }



  private async attachActorAccessGrantsToBlueprints(

    rows: OrganizationJourneyBlueprint[],

    actorId?: string,

  ): Promise<void> {

    if (!actorId || rows.length === 0) {

      return;

    }

    const rowIds = rows.map((row) => row.id).filter(Boolean);

    const grants = await this.accessGrantRepo.find({

      where: { blueprintRowId: In(rowIds), userId: actorId },

      order: { createdAt: 'ASC' },

    });

    const byRowId = new Map<string, OrganizationJourneyBlueprintAccessGrant[]>();

    for (const grant of grants) {

      const list = byRowId.get(grant.blueprintRowId) ?? [];

      list.push(grant);

      byRowId.set(grant.blueprintRowId, list);

    }

    for (const row of rows) {

      row.accessGrants = byRowId.get(row.id) ?? [];

    }

  }



  private async attachSharingSummaries(rows: OrganizationJourneyBlueprint[]): Promise<void> {

    if (rows.length === 0) {

      return;

    }

    const rowIds = rows.map((row) => row.id).filter(Boolean);

    const grants = await this.accessGrantRepo.find({

      where: { blueprintRowId: In(rowIds) },

    });

    const byRowId = new Map<string, OrganizationJourneyBlueprintAccessGrant[]>();

    for (const grant of grants) {

      const list = byRowId.get(grant.blueprintRowId) ?? [];

      list.push(grant);

      byRowId.set(grant.blueprintRowId, list);

    }

    for (const row of rows) {

      const rowGrants = byRowId.get(row.id) ?? [];

      row.sharingHasModify = blueprintSharingHasMode(rowGrants, BlueprintAccessMode.MODIFY);

      row.sharingHasPublish = blueprintSharingHasMode(rowGrants, BlueprintAccessMode.PUBLISH);

    }

  }



  private async hydrateBlueprintRow(

    row: OrganizationJourneyBlueprint,

    actor?: BlueprintPermissionActor,

    options?: { fullGrants?: boolean },

  ): Promise<OrganizationJourneyBlueprint> {

    await this.attachEditLockToBlueprint(row, actor);

    if (options?.fullGrants) {

      row.accessGrants = await this.loadAccessGrantsForBlueprint(row.id);

      row.sharingHasModify = blueprintSharingHasMode(row.accessGrants, BlueprintAccessMode.MODIFY);

      row.sharingHasPublish = blueprintSharingHasMode(row.accessGrants, BlueprintAccessMode.PUBLISH);

    } else if (actor?.id) {

      row.accessGrants = (

        await this.accessGrantRepo.find({

          where: { blueprintRowId: row.id, userId: actor.id },

          order: { createdAt: 'ASC' },

        })

      );

    }

    return row;

  }



  private async findRowOrThrow(

    rowId: string,

    organizationId: string,

    actor?: BlueprintPermissionActor,

    options?: { fullGrants?: boolean },

  ): Promise<OrganizationJourneyBlueprint> {

    const row = await this.blueprintRepo.findOne({

      where: { id: rowId, organizationId },

    });

    if (!row) {

      throw new NotFoundException('Blueprint not found');

    }

    return this.hydrateBlueprintRow(row, actor, options);

  }



  async listForOrganization(

    organizationId: string,

    actor?: BlueprintPermissionActor,

    projectKey?: string,

  ): Promise<OrganizationJourneyBlueprint[]> {

    const normalizedKey = projectKey ? normalizeFaqProjectKey(projectKey) : undefined;

    const rows = await this.blueprintRepo.find({

      where: normalizedKey ? { organizationId, projectKey: normalizedKey } : { organizationId },

      order: { updatedAt: 'DESC' },

    });

    await this.attachActorAccessGrantsToBlueprints(rows, actor?.id);

    await this.attachSharingSummaries(rows);

    await Promise.all(rows.map((row) => this.attachEditLockToBlueprint(row, actor)));

    return rows;

  }



  async getForManage(

    rowId: string,

    organizationId: string,

    actor?: BlueprintPermissionActor,

  ): Promise<OrganizationJourneyBlueprint> {

    assertCanManageBlueprints(actor);

    return this.findRowOrThrow(rowId, organizationId, actor, { fullGrants: true });

  }



  /**

   * SDK runtime: published blueprints only, scoped to organization from JWT.

   */

  async listPublishedPayloads(
    organizationId: string,
    projectKey?: string,
  ): Promise<Record<string, unknown>[]> {
    const normalizedKey = normalizeFaqProjectKey(projectKey);

    const rows = await this.blueprintRepo.find({

      where: { organizationId, isPublished: true, projectKey: normalizedKey },

      order: { updatedAt: 'ASC' },

    });

    return rows.map((row) => row.payload);

  }

  async listProjectKeyBlueprintCounts(organizationId: string): Promise<Record<string, number>> {
    const rows = await this.blueprintRepo
      .createQueryBuilder('bp')
      .select('bp.project_key', 'projectKey')
      .addSelect('COUNT(*)', 'count')
      .where('bp.organization_id = :organizationId', { organizationId })
      .groupBy('bp.project_key')
      .orderBy('bp.project_key', 'ASC')
      .getRawMany<{ projectKey: string; count: string }>();

    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (!row.projectKey) continue;
      counts[normalizeFaqProjectKey(row.projectKey)] = Number(row.count) || 0;
    }
    return counts;
  }



  async create(

    organizationId: string,

    actor: BlueprintPermissionActor,

    dto: UpsertOrganizationJourneyBlueprintDto,

  ): Promise<OrganizationJourneyBlueprint> {

    assertCanManageBlueprints(actor);

    const payload = this.assertValidPayload(dto.blueprint);

    const blueprintId = String(payload.id);

    const vertical = String(payload.vertical);

    const projectKey = normalizeFaqProjectKey(dto.projectKey);



    const existing = await this.blueprintRepo.findOne({

      where: { organizationId, blueprintId },

    });

    if (existing) {

      throw new BadRequestException(`Blueprint id "${blueprintId}" already exists for this organization`);

    }



    const row = this.blueprintRepo.create({

      organizationId,

      blueprintId,

      vertical,

      projectKey,

      isPublished: dto.isPublished ?? false,

      payload,

      createdBy: actor.id,

    });

    const saved = await this.blueprintRepo.save(row);

    await this.faqEntryService.registerProject(organizationId, projectKey);

    return this.hydrateBlueprintRow(saved, actor);

  }



  async update(

    rowId: string,

    organizationId: string,

    actor: BlueprintPermissionActor,

    dto: UpsertOrganizationJourneyBlueprintDto,

  ): Promise<OrganizationJourneyBlueprint> {

    assertCanManageBlueprints(actor);

    const row = await this.findRowOrThrow(rowId, organizationId, actor);

    assertCanModifyBlueprint(row, actor);



    const holderDisplayName = row.editLockedBy

      ? await this.loadUserDisplayName(row.editLockedBy)

      : undefined;

    assertBlueprintEditLockHeldForSave(row, actor.id, holderDisplayName);



    const payload = this.assertValidPayload(dto.blueprint);

    const blueprintId = String(payload.id);

    if (blueprintId !== row.blueprintId) {

      const conflict = await this.blueprintRepo.findOne({

        where: { organizationId, blueprintId },

      });

      if (conflict && conflict.id !== rowId) {

        throw new BadRequestException(`Blueprint id "${blueprintId}" already exists for this organization`);

      }

    }



    if (dto.isPublished !== undefined && dto.isPublished !== row.isPublished) {

      assertCanPublishBlueprint(row, actor);

      const editHolder = await this.resolveEditLockHolderDisplayName(row);

      assertBlueprintPublishBlockedWhileEditedByOther(

        row,

        actor.id,

        editHolder,

      );

    }



    row.blueprintId = blueprintId;

    row.vertical = String(payload.vertical);

    row.payload = payload;

    if (dto.projectKey !== undefined) {
      const projectKey = normalizeFaqProjectKey(dto.projectKey);
      row.projectKey = projectKey;
      await this.faqEntryService.registerProject(organizationId, projectKey);
    }

    if (dto.isPublished !== undefined) {

      row.isPublished = dto.isPublished;

    }

    const saved = await this.blueprintRepo.save(row);

    return this.hydrateBlueprintRow(saved, actor);

  }



  private async resolveEditLockHolderDisplayName(

    row: Pick<OrganizationJourneyBlueprint, 'editLockedBy' | 'editLockExpiresAt'>,

  ): Promise<string | undefined> {

    if (!hasActiveBlueprintEditLock(row) || !row.editLockedBy) {

      return undefined;

    }

    return this.loadUserDisplayName(row.editLockedBy);

  }



  async setPublished(

    rowId: string,

    organizationId: string,

    actor: BlueprintPermissionActor,

    isPublished: boolean,

  ): Promise<OrganizationJourneyBlueprint> {

    assertCanManageBlueprints(actor);



    return this.blueprintRepo.manager.transaction(async (manager) => {

      const row = await manager.findOne(OrganizationJourneyBlueprint, {

        where: { id: rowId, organizationId },

        lock: { mode: 'pessimistic_write' },

      });

      if (!row) {

        throw new NotFoundException('Blueprint not found');

      }



      const hydrated = await this.hydrateBlueprintRow(row, actor);

      assertCanPublishBlueprint(hydrated, actor);



      const holderDisplayName = await this.resolveEditLockHolderDisplayName(hydrated);

      assertBlueprintPublishBlockedWhileEditedByOther(

        hydrated,

        actor.id,

        holderDisplayName,

      );



      if (hydrated.isPublished === isPublished) {

        return hydrated;

      }



      hydrated.isPublished = isPublished;

      const saved = await manager.save(hydrated);

      return this.hydrateBlueprintRow(saved, actor);

    });

  }



  async remove(

    rowId: string,

    organizationId: string,

    actor: BlueprintPermissionActor,

  ): Promise<void> {

    const row = await this.findRowOrThrow(rowId, organizationId, actor);

    assertCanDeleteBlueprint(row, actor);

    const holderDisplayName = await this.resolveEditLockHolderDisplayName(row);

    assertBlueprintDeleteBlockedWhileEditing(

      row,

      actor.id,

      holderDisplayName,

    );

    await this.blueprintRepo.remove(row);

  }



  async setBlueprintAccessGrants(

    rowId: string,

    organizationId: string,

    dto: SetBlueprintAccessGrantsDto,

    actor: BlueprintPermissionActor,

  ): Promise<OrganizationJourneyBlueprint> {

    const row = await this.findRowOrThrow(rowId, organizationId, actor, { fullGrants: true });

    assertCanManageBlueprintAccess(row, actor);



    const uniqueGrants = new Map<
      string,
      { userId: string; accessMode: BlueprintAccessMode }
    >();

    for (const item of dto.grants) {

      if (item.userId === row.createdBy) {

        continue;

      }

      uniqueGrants.set(`${item.userId}|${item.accessMode}`, {
        userId: item.userId,
        accessMode: item.accessMode,
      });

    }



    const userIds = [
      ...new Set([...uniqueGrants.values()].map((grant) => grant.userId)),
    ];

    if (userIds.length > 0) {

      const members = await this.userRepository.find({

        where: {

          id: In(userIds),

          organizationId,

          isActive: true,

          role: UserRole.ADMIN,

        },

      });

      if (members.length !== userIds.length) {

        throw new BadRequestException(

          'Un ou plusieurs administrateurs sont invalides ou hors de votre organisation.',

        );

      }

    }



    if (dto.replace !== false) {

      await this.accessGrantRepo.delete({ blueprintRowId: rowId });

    }



    for (const grant of uniqueGrants.values()) {

      await this.accessGrantRepo.save({

        blueprintRowId: rowId,

        organizationId,

        userId: grant.userId,

        accessMode: grant.accessMode,

        grantedBy: actor.id,

      });

    }



    return this.findRowOrThrow(rowId, organizationId, actor, { fullGrants: true });

  }



  async acquireBlueprintEditLock(

    rowId: string,

    organizationId: string,

    actor: BlueprintPermissionActor,

  ): Promise<{ blueprint: OrganizationJourneyBlueprint; editLock: BlueprintEditLockInfo }> {

    assertCanManageBlueprints(actor);

    assertCanAcquireBlueprintEditLock(actor.id);

    const row = await this.findRowOrThrow(rowId, organizationId, actor);

    assertCanModifyBlueprint(row, actor);



    const actorId = actor.id;

    const now = new Date();



    if (

      !row.editLockedBy ||

      isBlueprintEditLockExpired(row.editLockExpiresAt) ||

      row.editLockedBy === actorId

    ) {

      row.editLockedBy = actorId;

      row.editLockedAt = now;

      row.editLockExpiresAt = new Date(now.getTime() + BLUEPRINT_EDIT_LOCK_TTL_MS);

      await this.blueprintRepo.save({

        id: row.id,

        editLockedBy: row.editLockedBy,

        editLockedAt: row.editLockedAt,

        editLockExpiresAt: row.editLockExpiresAt,

      });

      const refreshed = await this.findRowOrThrow(rowId, organizationId, actor);

      return { blueprint: refreshed, editLock: refreshed.editLock! };

    }



    const holderDisplayName = await this.loadUserDisplayName(row.editLockedBy);

    const editLock = buildBlueprintEditLockInfo(row, actorId, holderDisplayName);

    throw new ConflictException({

      message: buildBlueprintEditLockConflictMessage(holderDisplayName),

      editLock,

    });

  }



  async renewBlueprintEditLock(

    rowId: string,

    organizationId: string,

    actor: BlueprintPermissionActor,

  ): Promise<{ blueprint: OrganizationJourneyBlueprint; editLock: BlueprintEditLockInfo }> {

    assertCanManageBlueprints(actor);

    assertCanAcquireBlueprintEditLock(actor.id);

    const row = await this.findRowOrThrow(rowId, organizationId, actor);

    assertCanModifyBlueprint(row, actor);



    if (!isBlueprintEditLockHeldBy(row, actor.id)) {

      const holderDisplayName = row.editLockedBy

        ? await this.loadUserDisplayName(row.editLockedBy)

        : undefined;

      throw new ConflictException({

        message: buildBlueprintEditLockConflictMessage(holderDisplayName),

        editLock: buildBlueprintEditLockInfo(row, actor.id, holderDisplayName),

      });

    }



    const now = new Date();

    row.editLockExpiresAt = new Date(now.getTime() + BLUEPRINT_EDIT_LOCK_TTL_MS);

    await this.blueprintRepo.save({

      id: row.id,

      editLockExpiresAt: row.editLockExpiresAt,

    });

    const refreshed = await this.findRowOrThrow(rowId, organizationId, actor);

    return { blueprint: refreshed, editLock: refreshed.editLock! };

  }



  async releaseBlueprintEditLock(

    rowId: string,

    organizationId: string,

    actor?: BlueprintPermissionActor,

  ): Promise<void> {

    const row = await this.blueprintRepo.findOne({

      where: { id: rowId, organizationId },

    });

    if (!row || !row.editLockedBy) {

      return;

    }

    if (

      row.editLockedBy !== actor?.id &&

      !isBlueprintEditLockExpired(row.editLockExpiresAt)

    ) {

      return;

    }

    row.editLockedBy = null;

    row.editLockedAt = null;

    row.editLockExpiresAt = null;

    await this.blueprintRepo.save({

      id: row.id,

      editLockedBy: null,

      editLockedAt: null,

      editLockExpiresAt: null,

    });

  }



  getCatalogMetadata() {

    return {

      verticals: [...JOURNEY_VERTICALS],

      intents: [...TOUR_DRAFT_INTENTS],

      semanticRoles: [...JOURNEY_STEP_SEMANTIC_ROLES],

    };

  }

}



import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

/** Durée du verrou ; renouvelé par heartbeat côté éditeur. */
export const ADMIN_RESOURCE_EDIT_LOCK_TTL_MS = 120_000;

export type AdminResourceEditLockFields = {
  editLockedBy?: string | null;
  editLockedAt?: Date | string | null;
  editLockExpiresAt?: Date | string | null;
};

export type AdminResourceEditLockInfo = {
  required: boolean;
  heldByUserId?: string;
  heldByDisplayName?: string;
  lockedAt?: string;
  expiresAt?: string;
  isHeldByMe: boolean;
};

export type AdminResourceLabel = 'utilisateur' | 'organisation';

export function isAdminResourceEditLockExpired(expiresAt?: Date | string | null): boolean {
  if (!expiresAt) {
    return true;
  }
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return !Number.isFinite(ms) || ms <= Date.now();
}

export function isAdminResourceEditLockHeldBy(
  row: AdminResourceEditLockFields,
  userId?: string,
): boolean {
  if (!userId || !row.editLockedBy) {
    return false;
  }
  if (isAdminResourceEditLockExpired(row.editLockExpiresAt)) {
    return false;
  }
  return row.editLockedBy === userId;
}

export function buildAdminResourceEditLockInfo(
  row: AdminResourceEditLockFields,
  required: boolean,
  actorId?: string,
  holderDisplayName?: string,
): AdminResourceEditLockInfo {
  if (!required) {
    return { required: false, isHeldByMe: true };
  }

  const expired = isAdminResourceEditLockExpired(row.editLockExpiresAt);
  const heldByUserId = expired ? undefined : row.editLockedBy ?? undefined;
  const isHeldByMe = Boolean(actorId && heldByUserId && heldByUserId === actorId);

  return {
    required: true,
    heldByUserId,
    heldByDisplayName: heldByUserId ? holderDisplayName : undefined,
    lockedAt:
      heldByUserId && row.editLockedAt
        ? new Date(row.editLockedAt).toISOString()
        : undefined,
    expiresAt:
      heldByUserId && row.editLockExpiresAt
        ? new Date(row.editLockExpiresAt).toISOString()
        : undefined,
    isHeldByMe,
  };
}

export function assertCanAcquireAdminResourceEditLock(actorId?: string): void {
  if (!actorId) {
    throw new ForbiddenException('Authentification requise.');
  }
}

export function assertAdminResourceEditLockHeldForSave(
  row: AdminResourceEditLockFields,
  required: boolean,
  resourceLabel: AdminResourceLabel,
  actorId?: string,
  holderDisplayName?: string,
): void {
  if (!required) {
    return;
  }
  if (!actorId) {
    throw new ForbiddenException('Authentification requise.');
  }
  if (isAdminResourceEditLockHeldBy(row, actorId)) {
    return;
  }

  if (!hasActiveAdminResourceEditLock(row)) {
    if (row.editLockedBy === actorId) {
      throw new ForbiddenException(
        'Votre verrou d’édition a expiré. Rouvrez la page pour reprendre la main.',
      );
    }
    throw new ForbiddenException(
      'Verrou d’édition requis. Rouvrez la page pour reprendre la main.',
    );
  }

  const info = buildAdminResourceEditLockInfo(row, true, actorId, holderDisplayName);
  const label = info.heldByDisplayName?.trim() || 'un autre administrateur';
  throw new ConflictException({
    message: `Cet ${resourceLabel} est en cours de modification par ${label}. Enregistrement impossible.`,
    editLock: info,
  });
}

type AdminResourceEditLockEntity = ObjectLiteral &
  AdminResourceEditLockFields & {
    id: string;
  };

export type AdminResourceEditLockAcquireResult = 'acquired' | 'held_by_other';

/** Acquisition atomique (SELECT … FOR UPDATE) pour éviter deux éditeurs simultanés. */
export async function acquireAdminResourceEditLockAtomic<T extends AdminResourceEditLockEntity>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  id: string,
  actorId: string,
): Promise<AdminResourceEditLockAcquireResult> {
  const row = await manager.findOne(entity, {
    where: { id } as object,
    lock: { mode: 'pessimistic_write' },
  });
  if (!row) {
    throw new NotFoundException('Ressource introuvable');
  }

  const now = new Date();
  if (
    !row.editLockedBy ||
    isAdminResourceEditLockExpired(row.editLockExpiresAt) ||
    row.editLockedBy === actorId
  ) {
    await manager.save(entity, {
      id: row.id,
      editLockedBy: actorId,
      editLockedAt: now,
      editLockExpiresAt: new Date(now.getTime() + ADMIN_RESOURCE_EDIT_LOCK_TTL_MS),
    } as T);
    return 'acquired';
  }

  return 'held_by_other';
}

/** Renouvellement atomique du TTL pour l’éditeur qui détient déjà le verrou. */
export async function renewAdminResourceEditLockAtomic<T extends AdminResourceEditLockEntity>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  id: string,
  actorId: string,
): Promise<T> {
  const row = await manager.findOne(entity, {
    where: { id } as object,
    lock: { mode: 'pessimistic_write' },
  });
  if (!row) {
    throw new NotFoundException('Ressource introuvable');
  }
  if (!isAdminResourceEditLockHeldBy(row, actorId)) {
    return row;
  }

  await manager.save(entity, {
    id: row.id,
    editLockExpiresAt: new Date(Date.now() + ADMIN_RESOURCE_EDIT_LOCK_TTL_MS),
  } as T);

  const refreshed = await manager.findOne(entity, { where: { id } as object });
  if (!refreshed) {
    throw new NotFoundException('Ressource introuvable');
  }
  return refreshed;
}

export function buildAdminResourceEditLockConflictMessage(
  resourceLabel: AdminResourceLabel,
  holderDisplayName?: string,
): string {
  const label = holderDisplayName?.trim() || 'un autre administrateur';
  return `Cet ${resourceLabel} est en cours de modification par ${label}. Réessayez lorsque l’éditeur aura quitté la page.`;
}

export function hasActiveAdminResourceEditLock(row: AdminResourceEditLockFields): boolean {
  return Boolean(row.editLockedBy && !isAdminResourceEditLockExpired(row.editLockExpiresAt));
}

export function assertAdminResourceDeleteBlockedWhileEditing(
  row: AdminResourceEditLockFields,
  resourceLabel: AdminResourceLabel,
  actorId?: string,
  holderDisplayName?: string,
): void {
  if (!hasActiveAdminResourceEditLock(row)) {
    return;
  }

  const info = buildAdminResourceEditLockInfo(row, true, actorId, holderDisplayName);
  const label = info.heldByDisplayName?.trim() || 'un autre administrateur';
  throw new ConflictException({
    message: `Suppression impossible : cet ${resourceLabel} est en cours de modification par ${label}.`,
    editLock: info,
  });
}

/** Verrou requis quand un admin modifie la fiche d’un autre utilisateur. */
export function userAdminEditRequiresLock(actorId?: string, targetUserId?: string): boolean {
  if (!actorId || !targetUserId) {
    return false;
  }
  return actorId !== targetUserId;
}

/** Verrou requis pour toute édition admin d’une organisation. */
export function organizationAdminEditRequiresLock(): boolean {
  return true;
}


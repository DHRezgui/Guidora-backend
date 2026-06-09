import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { OrganizationJourneyBlueprint } from './entities/organization-journey-blueprint.entity';

/** Durée du verrou ; renouvelé par heartbeat côté éditeur. */
export const BLUEPRINT_EDIT_LOCK_TTL_MS = 120_000;

export type BlueprintEditLockInfo = {
  required: boolean;
  heldByUserId?: string;
  heldByDisplayName?: string;
  lockedAt?: string;
  expiresAt?: string;
  isHeldByMe: boolean;
};

export function isBlueprintEditLockExpired(expiresAt?: Date | string | null): boolean {
  if (!expiresAt) {
    return true;
  }
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return !Number.isFinite(ms) || ms <= Date.now();
}

/** Les blueprints org exigent toujours un verrou en mode édition (admin-admin). */
export function blueprintRequiresEditLock(): boolean {
  return true;
}

export function isBlueprintEditLockHeldBy(
  row: Pick<OrganizationJourneyBlueprint, 'editLockedBy' | 'editLockExpiresAt'>,
  userId?: string,
): boolean {
  if (!userId || !row.editLockedBy) {
    return false;
  }
  if (isBlueprintEditLockExpired(row.editLockExpiresAt)) {
    return false;
  }
  return row.editLockedBy === userId;
}

export function buildBlueprintEditLockInfo(
  row: Pick<
    OrganizationJourneyBlueprint,
    'editLockedBy' | 'editLockedAt' | 'editLockExpiresAt'
  >,
  actorId?: string,
  holderDisplayName?: string,
): BlueprintEditLockInfo {
  const required = blueprintRequiresEditLock();
  if (!required) {
    return { required: false, isHeldByMe: true };
  }

  const expired = isBlueprintEditLockExpired(row.editLockExpiresAt);
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

export function assertCanAcquireBlueprintEditLock(actorId?: string): void {
  if (!actorId) {
    throw new ForbiddenException('Authentification requise.');
  }
}

export function assertBlueprintEditLockHeldForSave(
  row: Pick<
    OrganizationJourneyBlueprint,
    'editLockedBy' | 'editLockedAt' | 'editLockExpiresAt'
  >,
  actorId?: string,
  holderDisplayName?: string,
): void {
  if (!blueprintRequiresEditLock()) {
    return;
  }
  if (!actorId) {
    throw new ForbiddenException('Authentification requise.');
  }
  if (isBlueprintEditLockHeldBy(row, actorId)) {
    return;
  }
  if (isBlueprintEditLockExpired(row.editLockExpiresAt)) {
    throw new ForbiddenException(
      'Votre verrou d’édition a expiré. Rouvrez l’éditeur pour reprendre la main.',
    );
  }
  const info = buildBlueprintEditLockInfo(row, actorId, holderDisplayName);
  const label = info.heldByDisplayName?.trim() || 'un autre utilisateur';
  throw new ConflictException({
    message: `Ce blueprint est en cours d’édition par ${label}. Enregistrement impossible.`,
    editLock: info,
  });
}

export function buildBlueprintEditLockConflictMessage(holderDisplayName?: string): string {
  const label = holderDisplayName?.trim() || 'un autre utilisateur';
  return `Ce blueprint est en cours d’édition par ${label}. Réessayez lorsque l’éditeur aura quitté la page.`;
}

export function hasActiveBlueprintEditLock(
  row: Pick<OrganizationJourneyBlueprint, 'editLockedBy' | 'editLockExpiresAt'>,
): boolean {
  return Boolean(row.editLockedBy && !isBlueprintEditLockExpired(row.editLockExpiresAt));
}

/** Bloque publication depuis la liste si un autre admin édite (l’éditeur peut publier via Enregistrer). */
export function assertBlueprintPublishBlockedWhileEditedByOther(
  row: Pick<
    OrganizationJourneyBlueprint,
    'editLockedBy' | 'editLockedAt' | 'editLockExpiresAt'
  >,
  actorId: string | undefined,
  holderDisplayName: string | undefined,
): void {
  if (!hasActiveBlueprintEditLock(row)) {
    return;
  }
  if (isBlueprintEditLockHeldBy(row, actorId)) {
    return;
  }

  const info = buildBlueprintEditLockInfo(row, actorId, holderDisplayName);
  const label = info.heldByDisplayName?.trim() || 'un autre administrateur';
  throw new ConflictException({
    message: `Publication impossible : ce blueprint est en cours d’édition par ${label}.`,
    editLock: info,
  });
}

/** Bloque suppression tant qu’une session d’édition est active (tous les admins). */
export function assertBlueprintDeleteBlockedWhileEditing(
  row: Pick<
    OrganizationJourneyBlueprint,
    'editLockedBy' | 'editLockedAt' | 'editLockExpiresAt'
  >,
  actorId: string | undefined,
  holderDisplayName: string | undefined,
): void {
  if (!hasActiveBlueprintEditLock(row)) {
    return;
  }

  const info = buildBlueprintEditLockInfo(row, actorId, holderDisplayName);
  const label = info.heldByDisplayName?.trim() || 'un autre administrateur';
  throw new ConflictException({
    message: `Suppression impossible : ce blueprint est en cours d’édition par ${label}.`,
    editLock: info,
  });
}

import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { FaqItem } from './entities/faq-item.entity';

/** Durée du verrou ; renouvelé par heartbeat côté éditeur. */
export const FAQ_EDIT_LOCK_TTL_MS = 120_000;

export type FaqEditLockInfo = {
  required: boolean;
  heldByUserId?: string;
  heldByDisplayName?: string;
  lockedAt?: string;
  expiresAt?: string;
  isHeldByMe: boolean;
};

export function isFaqEditLockExpired(expiresAt?: Date | string | null): boolean {
  if (!expiresAt) {
    return true;
  }
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return !Number.isFinite(ms) || ms <= Date.now();
}

export function faqRequiresEditLock(): boolean {
  return true;
}

export function isFaqEditLockHeldBy(
  row: Pick<FaqItem, 'editLockedBy' | 'editLockExpiresAt'>,
  userId?: string,
): boolean {
  if (!userId || !row.editLockedBy) {
    return false;
  }
  if (isFaqEditLockExpired(row.editLockExpiresAt)) {
    return false;
  }
  return row.editLockedBy === userId;
}

export function buildFaqEditLockInfo(
  row: Pick<FaqItem, 'editLockedBy' | 'editLockedAt' | 'editLockExpiresAt'>,
  actorId?: string,
  holderDisplayName?: string,
): FaqEditLockInfo {
  const required = faqRequiresEditLock();
  if (!required) {
    return { required: false, isHeldByMe: true };
  }

  const expired = isFaqEditLockExpired(row.editLockExpiresAt);
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

export function assertCanAcquireFaqEditLock(actorId?: string): void {
  if (!actorId) {
    throw new ForbiddenException('Authentification requise.');
  }
}

export function assertFaqEditLockHeldForSave(
  row: Pick<FaqItem, 'editLockedBy' | 'editLockedAt' | 'editLockExpiresAt'>,
  actorId?: string,
  holderDisplayName?: string,
): void {
  if (!faqRequiresEditLock()) {
    return;
  }
  if (!actorId) {
    throw new ForbiddenException('Authentification requise.');
  }
  if (isFaqEditLockHeldBy(row, actorId)) {
    return;
  }
  if (isFaqEditLockExpired(row.editLockExpiresAt)) {
    throw new ForbiddenException(
      'Votre verrou d’édition a expiré. Rouvrez l’éditeur pour reprendre la main.',
    );
  }
  const info = buildFaqEditLockInfo(row, actorId, holderDisplayName);
  const label = info.heldByDisplayName?.trim() || 'un autre administrateur';
  throw new ConflictException({
    message: `Cette entrée FAQ est en cours d’édition par ${label}. Enregistrement impossible.`,
    editLock: info,
  });
}

export function buildFaqEditLockConflictMessage(holderDisplayName?: string): string {
  const label = holderDisplayName?.trim() || 'un autre administrateur';
  return `Cette entrée FAQ est en cours d’édition par ${label}. Réessayez lorsque l’éditeur aura quitté la page.`;
}

export function hasActiveFaqEditLock(
  row: Pick<FaqItem, 'editLockedBy' | 'editLockExpiresAt'>,
): boolean {
  return Boolean(row.editLockedBy && !isFaqEditLockExpired(row.editLockExpiresAt));
}

export function assertFaqPublishBlockedWhileEditedByOther(
  row: Pick<FaqItem, 'editLockedBy' | 'editLockedAt' | 'editLockExpiresAt'>,
  actorId: string | undefined,
  holderDisplayName: string | undefined,
): void {
  if (!hasActiveFaqEditLock(row)) {
    return;
  }
  if (isFaqEditLockHeldBy(row, actorId)) {
    return;
  }

  const info = buildFaqEditLockInfo(row, actorId, holderDisplayName);
  const label = info.heldByDisplayName?.trim() || 'un autre administrateur';
  throw new ConflictException({
    message: `Publication impossible : cette entrée FAQ est en cours d’édition par ${label}.`,
    editLock: info,
  });
}

export function assertFaqDeleteBlockedWhileEditing(
  row: Pick<FaqItem, 'editLockedBy' | 'editLockedAt' | 'editLockExpiresAt'>,
  actorId: string | undefined,
  holderDisplayName: string | undefined,
): void {
  if (!hasActiveFaqEditLock(row)) {
    return;
  }

  const info = buildFaqEditLockInfo(row, actorId, holderDisplayName);
  const label = info.heldByDisplayName?.trim() || 'un autre administrateur';
  throw new ConflictException({
    message: `Suppression impossible : cette entrée FAQ est en cours d’édition par ${label}.`,
    editLock: info,
  });
}

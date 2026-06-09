import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TourAccessMode } from './entities/guided-tour-access-grant.entity';
import type { GuidedTour } from './entities/guided-tour.entity';
import {
  canMutateTourWithGrants,
  type TourWithAccessGrants,
} from './guided-tour-access.util';
import type { TourPermissionActor } from './guided-tour-permissions.util';

/** Durée du verrou ; renouvelé par heartbeat côté éditeur. */
export const TOUR_EDIT_LOCK_TTL_MS = 120_000;

export type TourEditLockInfo = {
  required: boolean;
  heldByUserId?: string;
  heldByDisplayName?: string;
  lockedAt?: string;
  expiresAt?: string;
  isHeldByMe: boolean;
};

export function isTourEditLockExpired(expiresAt?: Date | string | null): boolean {
  if (!expiresAt) {
    return true;
  }
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return !Number.isFinite(ms) || ms <= Date.now();
}

export function tourRequiresEditLock(
  tour: Pick<GuidedTour, 'inCollaboration'> & TourWithAccessGrants,
): boolean {
  if (tour.inCollaboration) {
    return true;
  }
  return Boolean(
    tour.accessGrants?.some((g) => g.accessMode === TourAccessMode.COLLABORATE),
  );
}

export function isTourEditLockHeldBy(
  tour: Pick<GuidedTour, 'editLockedBy' | 'editLockExpiresAt'>,
  userId?: string,
): boolean {
  if (!userId || !tour.editLockedBy) {
    return false;
  }
  if (isTourEditLockExpired(tour.editLockExpiresAt)) {
    return false;
  }
  return tour.editLockedBy === userId;
}

export function buildTourEditLockInfo(
  tour: Pick<
    GuidedTour,
    'editLockedBy' | 'editLockedAt' | 'editLockExpiresAt' | 'inCollaboration'
  > &
    TourWithAccessGrants,
  actor?: TourPermissionActor,
  holderDisplayName?: string,
): TourEditLockInfo {
  const required = tourRequiresEditLock(tour);
  if (!required) {
    return { required: false, isHeldByMe: true };
  }

  const expired = isTourEditLockExpired(tour.editLockExpiresAt);
  const heldByUserId = expired ? undefined : tour.editLockedBy ?? undefined;
  const isHeldByMe = Boolean(actor?.id && heldByUserId && heldByUserId === actor.id);

  return {
    required: true,
    heldByUserId,
    heldByDisplayName: heldByUserId ? holderDisplayName : undefined,
    lockedAt:
      heldByUserId && tour.editLockedAt
        ? new Date(tour.editLockedAt).toISOString()
        : undefined,
    expiresAt:
      heldByUserId && tour.editLockExpiresAt
        ? new Date(tour.editLockExpiresAt).toISOString()
        : undefined,
    isHeldByMe,
  };
}

export function assertCanAcquireTourEditLock(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): void {
  if (!actor?.id) {
    throw new ForbiddenException('Authentification requise.');
  }
  if (!canMutateTourWithGrants(tour, actor)) {
    throw new ForbiddenException('Vous n’avez pas les droits d’édition sur ce parcours.');
  }
}

export function assertTourEditLockHeldForSave(
  tour: Pick<GuidedTour, 'editLockedBy' | 'editLockExpiresAt' | 'inCollaboration'> &
    TourWithAccessGrants,
  actor?: TourPermissionActor,
  holderDisplayName?: string,
): void {
  if (!tourRequiresEditLock(tour)) {
    return;
  }
  if (!actor?.id) {
    throw new ForbiddenException('Authentification requise.');
  }
  if (isTourEditLockHeldBy(tour, actor.id)) {
    return;
  }
  if (isTourEditLockExpired(tour.editLockExpiresAt)) {
    throw new ForbiddenException(
      'Votre verrou d’édition a expiré. Rouvrez l’éditeur pour reprendre la main.',
    );
  }
  const info = buildTourEditLockInfo(tour, actor, holderDisplayName);
  const label = info.heldByDisplayName?.trim() || 'un autre utilisateur';
  throw new ConflictException({
    message: `Ce parcours est en cours d’édition par ${label}. Enregistrement impossible.`,
    editLock: info,
  });
}

export function buildEditLockConflictMessage(holderDisplayName?: string): string {
  const label = holderDisplayName?.trim() || 'un autre utilisateur';
  return `Ce parcours est en cours d’édition par ${label}. Réessayez lorsque l’éditeur aura quitté la page.`;
}

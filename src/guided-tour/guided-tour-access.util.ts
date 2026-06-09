import { ForbiddenException } from '@nestjs/common';
import type { GuidedTour } from './entities/guided-tour.entity';
import { TourEnvironment, TourSandboxStatus } from './entities/guided-tour.entity';
import {
  GuidedTourAccessGrant,
  TourAccessMode,
} from './entities/guided-tour-access-grant.entity';
import {
  isAdminActor,
  isDeveloperActor,
  isTourProductionDeployment,
  type TourPermissionActor,
} from './guided-tour-permissions.util';
import { isSdkLabTemplateTour } from './guided-tour-lab.util';
import {
  hasDeveloperModerationSubmissionHistory,
  isAdminOriginatedProductionTour,
  isAdminSandboxPrivateTour,
  isDeveloperModerationRevokedFromAdmin,
  isDeveloperOriginatedTour,
  isProductionManagerAdmin,
  isTourAssignedToAdmin,
  normalizeAssignedAdminIds,
  resolveProductionManagerAdminId,
  type TourVisibilityFields,
} from './guided-tour-visibility.util';

export type TourWithAccessGrants = TourVisibilityFields &
  Pick<GuidedTour, 'sandboxRejectedBy' | 'assignedToAdminsAt'> & {
    inCollaboration?: boolean;
    accessGrants?: Pick<GuidedTourAccessGrant, 'userId' | 'accessMode'>[];
  };

export function getTourAccessGrant(
  tour: TourWithAccessGrants,
  userId?: string,
): Pick<GuidedTourAccessGrant, 'userId' | 'accessMode'> | undefined {
  if (!userId || !tour.accessGrants?.length) {
    return undefined;
  }
  return tour.accessGrants.find((g) => g.userId === userId);
}

export function hasTourAccessGrant(
  tour: TourWithAccessGrants,
  userId: string | undefined,
  mode: TourAccessMode,
): boolean {
  const grant = getTourAccessGrant(tour, userId);
  return grant?.accessMode === mode;
}

function isDeveloperOwnedAwaitingAdminDecision(
  tour: Pick<GuidedTour, 'createdBy' | 'environment' | 'sandboxStatus' | 'assignedAdminIds'>,
  userId?: string,
): boolean {
  return (
    Boolean(userId) &&
    tour.createdBy === userId &&
    tour.environment === TourEnvironment.SANDBOX &&
    tour.sandboxStatus === TourSandboxStatus.PENDING &&
    normalizeAssignedAdminIds(tour.assignedAdminIds).length > 0
  );
}

/** Gestion du partage : propriétaire du parcours uniquement (pas les invités collab/view). */
export function canManageTourAccess(
  tour: Pick<GuidedTour, 'createdBy' | 'targetUrl' | 'triggerConditions' | 'environment' | 'sandboxStatus'>,
  actor?: TourPermissionActor,
): boolean {
  if (!actor?.id || isSdkLabTemplateTour(tour)) {
    return false;
  }
  return tour.createdBy === actor.id;
}

/**
 * Visibilité liste / détail.
 * Priorité : propriétaire → grant view/collaborate (contourne developer_private) → règles admin/dev par défaut.
 */
export function canActorViewTourWithGrants(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): boolean {
  if (!actor?.id) {
    return true;
  }
  if (tour.createdBy === actor.id) {
    return true;
  }
  if (hasTourAccessGrant(tour, actor.id, TourAccessMode.VIEW)) {
    return true;
  }
  if (hasTourAccessGrant(tour, actor.id, TourAccessMode.COLLABORATE)) {
    return true;
  }
  if (isDeveloperActor(actor)) {
    return false;
  }
  if (isAdminActor(actor)) {
    if (
      isDeveloperModerationRevokedFromAdmin(tour) &&
      !hasTourAccessGrant(tour, actor.id, TourAccessMode.VIEW) &&
      !hasTourAccessGrant(tour, actor.id, TourAccessMode.COLLABORATE)
    ) {
      return false;
    }
    if (isAdminSandboxPrivateTour(tour)) {
      return false;
    }
    if (!tour.developerPrivate) {
      return true;
    }
    return isTourAssignedToAdmin(tour, actor.id);
  }
  return true;
}

export function assertCanViewTourWithGrants(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): void {
  if (!canActorViewTourWithGrants(tour, actor)) {
    throw new ForbiddenException('Vous n’avez pas accès à ce parcours.');
  }
}

export function resolveEditorAccessMode(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): 'owner' | 'collaborate' | 'view' | 'admin' {
  if (!actor?.id) {
    return 'view';
  }
  if (isAdminOriginatedProductionTour(tour)) {
    const managerId = resolveProductionManagerAdminId(tour);
    if (actor.id === managerId) {
      return tour.createdBy === actor.id ? 'owner' : 'admin';
    }
    return 'view';
  }
  if (tour.createdBy === actor.id) {
    return 'owner';
  }
  if (hasTourAccessGrant(tour, actor.id, TourAccessMode.COLLABORATE)) {
    return 'collaborate';
  }
  if (hasTourAccessGrant(tour, actor.id, TourAccessMode.VIEW)) {
    return 'view';
  }
  if (isAdminActor(actor) && tour.inCollaboration) {
    return 'collaborate';
  }
  if (isAdminActor(actor) && !tour.inCollaboration) {
    return 'admin';
  }
  return 'view';
}

export function canMutateTourWithGrants(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): boolean {
  if (!actor?.id) {
    return false;
  }
  if (isAdminOriginatedProductionTour(tour)) {
    return isProductionManagerAdmin(tour, actor.id);
  }
  if (tour.createdBy === actor.id) {
    if (isDeveloperActor(actor) && isDeveloperOwnedAwaitingAdminDecision(tour, actor.id)) {
      return false;
    }
    return true;
  }
  const mode = resolveEditorAccessMode(tour, actor);
  if (mode === 'admin') {
    return true;
  }
  if (mode === 'collaborate' && tour.environment === TourEnvironment.SANDBOX) {
    if (
      isDeveloperOriginatedTour(tour) &&
      tour.sandboxStatus === TourSandboxStatus.APPROVED
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function assertCanMutateTourWithGrants(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): void {
  if (!canMutateTourWithGrants(tour, actor)) {
    throw new ForbiddenException(
      'Vous n’avez pas les droits d’édition sur ce parcours (accès lecture seule ou collaboration inactive).',
    );
  }
}

export function assertCanDeleteTour(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): void {
  if (isTourProductionDeployment(tour)) {
    throw new ForbiddenException(
      'Ce parcours est en production : repassez en sandbox pour le supprimer.',
    );
  }
  if (isSdkLabTemplateTour(tour)) {
    if (!actor?.id || tour.createdBy !== actor.id) {
      throw new ForbiddenException(
        'Seul le propriétaire peut supprimer un template de test généré par le lab SDK.',
      );
    }
    return;
  }
  assertCanMutateTourWithGrants(tour, actor);
  if (!isDeveloperActor(actor) || !actor?.id || tour.createdBy !== actor.id) {
    return;
  }
  if (
    tour.environment === TourEnvironment.SANDBOX &&
    hasDeveloperModerationSubmissionHistory(tour)
  ) {
    throw new ForbiddenException(
      'Ce parcours a été soumis à la modération : la suppression n’est plus autorisée tant qu’il n’a pas été approuvé par un administrateur.',
    );
  }
}

/** Duplication, concaténation ou clone : refus en lecture seule. */
export function canForkTour(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): boolean {
  if (!actor?.id || isSdkLabTemplateTour(tour)) {
    return false;
  }
  if (isTourProductionDeployment(tour)) {
    if (!isProductionManagerAdmin(tour, actor.id)) {
      return false;
    }
    if (tour.createdBy === actor.id) {
      return !isDeveloperOwnedAwaitingAdminDecision(tour, actor.id);
    }
    return true;
  }
  if (tour.createdBy === actor.id) {
    return !isDeveloperOwnedAwaitingAdminDecision(tour, actor.id);
  }
  const mode = resolveEditorAccessMode(tour, actor);
  return mode !== 'view';
}

export function assertCanForkTour(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): void {
  if (!canForkTour(tour, actor)) {
    throw new ForbiddenException(
      'Ce parcours est en lecture seule : duplication et concaténation ne sont pas autorisées.',
    );
  }
}

export function assertCanExportTour(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): void {
  assertCanViewTourWithGrants(tour, actor);
  if (resolveEditorAccessMode(tour, actor) === 'view') {
    throw new ForbiddenException(
      'L’export n’est pas autorisé pour un parcours en lecture seule.',
    );
  }
  if (
    actor?.id &&
    isDeveloperActor(actor) &&
    isDeveloperOwnedAwaitingAdminDecision(tour, actor.id)
  ) {
    throw new ForbiddenException(
      'Ce parcours est en attente de modération : l’export est verrouillé jusqu’à la décision de l’administrateur.',
    );
  }
}

/** Pair collaboration : test sandbox sans droits admin complets. */
export function canCollaborationPeerToggleSandboxTest(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): boolean {
  if (!actor?.id || tour.createdBy === actor.id) {
    return false;
  }
  if (tour.environment !== 'sandbox') {
    return false;
  }
  return resolveEditorAccessMode(tour, actor) === 'collaborate';
}

/** Lecture seule : autoriser le test sandbox (toggle audience sandbox) sans édition. */
export function canViewOnlyActorToggleSandboxTest(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): boolean {
  if (!actor?.id || tour.createdBy === actor.id) {
    return false;
  }
  return resolveEditorAccessMode(tour, actor) === 'view';
}

export function isTourCollaborationPeer(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): boolean {
  if (!actor?.id || tour.createdBy === actor.id) {
    return false;
  }
  return resolveEditorAccessMode(tour, actor) === 'collaborate';
}

export function assertCanModerateWhenNotCollaborating(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): void {
  if (isTourCollaborationPeer(tour, actor)) {
    throw new ForbiddenException(
      'Vous êtes invité en collaboration sur ce parcours : modération (approbation/rejet) interdite.',
    );
  }
  if (tour.inCollaboration) {
    throw new ForbiddenException(
      'Ce parcours est en collaboration sandbox : terminez la collaboration avant la modération.',
    );
  }
  if (
    tour.developerPrivate &&
    normalizeAssignedAdminIds(tour.assignedAdminIds).length > 0 &&
    isAdminActor(actor) &&
    !isTourAssignedToAdmin(tour, actor?.id)
  ) {
    throw new ForbiddenException('Ce parcours ne vous a pas été assigné par le développeur.');
  }
}

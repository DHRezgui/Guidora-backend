import { TourEnvironment, TourSandboxStatus } from './entities/guided-tour.entity';
import type { GuidedTour } from './entities/guided-tour.entity';
import {
  isAdminOriginatedTour,
  isDeveloperOriginatedTour,
  normalizeAssignedAdminIds,
  type TourVisibilityFields,
} from './guided-tour-visibility.util';

export type ContextualPublishBlockReason =
  | 'tour_already_approved_or_live'
  | 'tour_owned_by_higher_role'
  | 'tour_owned_by_another_publisher'
  | 'tour_awaiting_admin_moderation';

export type ContextualPublishDecision =
  | { action: 'create' }
  | { action: 'block'; reason: ContextualPublishBlockReason }
  | { action: 'refresh' }
  | { action: 'takeover' };

export function isContextualTourApprovedOrLive(
  tour: Pick<GuidedTour, 'environment' | 'sandboxStatus'>,
): boolean {
  return (
    tour.environment === TourEnvironment.PRODUCTION ||
    tour.sandboxStatus === TourSandboxStatus.APPROVED
  );
}

export function isContextualTourPendingSandbox(
  tour: Pick<GuidedTour, 'environment' | 'sandboxStatus'>,
): boolean {
  return tour.environment === TourEnvironment.SANDBOX && tour.sandboxStatus === TourSandboxStatus.PENDING;
}

export function isContextualTourAwaitingAdminModeration(
  tour: Pick<GuidedTour, 'environment' | 'sandboxStatus' | 'assignedAdminIds'>,
): boolean {
  return (
    isContextualTourPendingSandbox(tour) &&
    normalizeAssignedAdminIds(tour.assignedAdminIds).length > 0
  );
}

export function isContextualTourReturnedOrRejected(
  tour: Pick<GuidedTour, 'environment' | 'sandboxStatus'>,
): boolean {
  return (
    tour.environment === TourEnvironment.SANDBOX &&
    (tour.sandboxStatus === TourSandboxStatus.RETURNED ||
      tour.sandboxStatus === TourSandboxStatus.REJECTED)
  );
}

/**
 * Résout l’action de publication SDK pour une instance canonique (même signature).
 * Les règles sont évaluées strictement dans l’ordre documenté produit.
 */
export function resolveContextualPublishDecision(params: {
  existingTour?: TourVisibilityFields &
    Pick<GuidedTour, 'environment' | 'sandboxStatus' | 'createdBy' | 'assignedAdminIds'>;
  publisherId?: string;
  publisherIsAdmin: boolean;
  publisherIsDeveloper: boolean;
}): ContextualPublishDecision {
  const { existingTour, publisherId, publisherIsAdmin, publisherIsDeveloper } = params;

  if (!existingTour) {
    return { action: 'create' };
  }

  if (isContextualTourApprovedOrLive(existingTour)) {
    return { action: 'block', reason: 'tour_already_approved_or_live' };
  }

  const samePublisher = Boolean(publisherId) && existingTour.createdBy === publisherId;

  if (isContextualTourReturnedOrRejected(existingTour)) {
    if (samePublisher) {
      return { action: 'refresh' };
    }
    return { action: 'block', reason: 'tour_owned_by_another_publisher' };
  }

  if (!isContextualTourPendingSandbox(existingTour)) {
    return { action: 'block', reason: 'tour_owned_by_another_publisher' };
  }

  const ownerIsDeveloper = isDeveloperOriginatedTour(existingTour);
  const ownerIsAdmin = isAdminOriginatedTour(existingTour);

  if (samePublisher) {
    if (publisherIsDeveloper && isContextualTourAwaitingAdminModeration(existingTour)) {
      return { action: 'block', reason: 'tour_awaiting_admin_moderation' };
    }
    return { action: 'refresh' };
  }

  if (ownerIsDeveloper && publisherIsAdmin) {
    return { action: 'takeover' };
  }

  if (ownerIsAdmin && publisherIsDeveloper) {
    return { action: 'block', reason: 'tour_owned_by_higher_role' };
  }

  if (ownerIsAdmin && publisherIsAdmin) {
    return { action: 'block', reason: 'tour_owned_by_another_publisher' };
  }

  return { action: 'block', reason: 'tour_owned_by_another_publisher' };
}

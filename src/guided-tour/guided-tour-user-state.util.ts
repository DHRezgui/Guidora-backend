import { GuidedTour, TourEnvironment, TourReplayPolicy } from './entities/guided-tour.entity';
import { TourUserState, TourUserStateStatus } from './entities/tour-user-state.entity';
import { UserRole } from '../user/entities/user.entity';
import type { SdkTokenScope } from '../auth/sdk-token-scopes';
import { isDeveloperOnlyAutogenTour, isDeveloperOwnedTestTour } from './guided-tour-lab.util';
import type { TourRuntimeContext } from './guided-tour-permissions.util';
import { hasSandboxRuntimeAccess } from './guided-tour-permissions.util';
import { hasTourAccessGrant } from './guided-tour-access.util';
import { TourAccessMode } from './entities/guided-tour-access-grant.entity';

export function resolveTourAudienceEnvironment(
  tour: Pick<GuidedTour, 'environment'>,
): TourEnvironment {
  return tour.environment ?? TourEnvironment.PRODUCTION;
}

export type UserStateActor = TourRuntimeContext & {
  role?: UserRole | 'SDK_TOKEN';
};

function resolveActorRuntime(actor?: UserStateActor): TourRuntimeContext {
  return {
    userId: actor?.userId,
    userRole: actor?.userRole ?? actor?.role,
    scopes: actor?.scopes,
  };
}

/**
 * Détermine l'environnement d'audience pour dismiss/complete.
 * Sandbox et production ont chacun leur ligne (tour_id, user_id, environment).
 */
export function resolveAudienceForUserStateMutation(
  tour: Pick<GuidedTour, 'environment' | 'isActive' | 'isSandboxTestActive'>,
  actor?: UserStateActor,
  requestedAudience?: TourEnvironment,
): TourEnvironment {
  if (requestedAudience === TourEnvironment.SANDBOX || requestedAudience === TourEnvironment.PRODUCTION) {
    return requestedAudience;
  }

  if (tour.environment === TourEnvironment.SANDBOX) {
    return TourEnvironment.SANDBOX;
  }

  const runtime = resolveActorRuntime(actor);
  if (runtime.userRole === UserRole.USER) {
    return TourEnvironment.PRODUCTION;
  }

  if (!hasSandboxRuntimeAccess(runtime)) {
    return TourEnvironment.PRODUCTION;
  }

  const sandboxTestOn = Boolean(tour.isSandboxTestActive);
  const productionOn = Boolean(tour.isActive);

  if (sandboxTestOn && !productionOn) {
    return TourEnvironment.SANDBOX;
  }

  if (productionOn && !sandboxTestOn) {
    return TourEnvironment.PRODUCTION;
  }

  if (sandboxTestOn && productionOn && hasSandboxRuntimeAccess(runtime)) {
    return TourEnvironment.SANDBOX;
  }

  const scopes = runtime.scopes ?? [];
  const sandboxOnlyToken =
    scopes.includes('tours:sandbox' as SdkTokenScope) &&
    !scopes.includes('tours:runtime' as SdkTokenScope);

  if (sandboxOnlyToken) {
    return TourEnvironment.SANDBOX;
  }

  return TourEnvironment.PRODUCTION;
}

export function parseTourAudienceHeader(value?: string): TourEnvironment | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'sandbox') {
    return TourEnvironment.SANDBOX;
  }
  if (normalized === 'production' || normalized === 'prod') {
    return TourEnvironment.PRODUCTION;
  }
  return undefined;
}

export function resolveTourUserStateEnvironment(
  state: Pick<TourUserState, 'environment'>,
): TourEnvironment {
  return state.environment ?? TourEnvironment.PRODUCTION;
}

export function findTourUserStateForAudience(
  tour: Pick<GuidedTour, 'id' | 'environment'>,
  userStates: TourUserState[],
  audienceEnvironment?: TourEnvironment,
): TourUserState | undefined {
  const audience = audienceEnvironment ?? resolveTourAudienceEnvironment(tour);
  return userStates.find(
    (state) =>
      state.tourId === tour.id &&
      resolveTourUserStateEnvironment(state) === audience,
  );
}

export type TourActiveListSources = {
  inProductionList: boolean;
  inSandboxEnvList: boolean;
  inSandboxTestList: boolean;
};

/**
 * Détermine si un parcours doit apparaître dans `/tours/active/url`.
 * Sandbox test et production ont des canaux de blocage distincts.
 */
export function isTourVisibleInActiveList(
  tour: GuidedTour,
  userId: string,
  userStates: TourUserState[],
  now: Date,
  runtime: TourRuntimeContext | undefined,
  sources: TourActiveListSources,
): boolean {
  const sandboxRuntime = hasSandboxRuntimeAccess(runtime);
  const sandboxTestOn = Boolean(tour.isSandboxTestActive);
  const prodOn = Boolean(tour.isActive);
  const sandboxEnv = tour.environment === TourEnvironment.SANDBOX;
  const isSandboxLauncher = Boolean(runtime?.userId) && runtime?.userId === (tour.sandboxTestStartedBy ?? null);
  const hasSharingSandboxGrant =
    hasTourAccessGrant(tour, userId, TourAccessMode.VIEW) ||
    hasTourAccessGrant(tour, userId, TourAccessMode.COLLABORATE);
  const sandboxTestRunning = sandboxEnv ? prodOn : sandboxTestOn;

  const canAccessSandboxTest = () => {
    if (!sandboxRuntime) {
      return false;
    }
    // Invités lecture/collab : accès au test sandbox actif sans être le lanceur.
    if (hasSharingSandboxGrant && sandboxTestRunning) {
      return true;
    }
    if (!isSandboxLauncher) {
      return false;
    }
    if (isDeveloperOnlyAutogenTour(tour)) {
      return runtime?.userRole === UserRole.ADMIN || isDeveloperOwnedTestTour(tour, userId);
    }
    return true;
  };

  if (sources.inSandboxEnvList && sandboxEnv) {
    if (!canAccessSandboxTest()) return false;
    return !isTourBlockedByUserState(tour, userId, userStates, now, TourEnvironment.SANDBOX);
  }

  if (sources.inSandboxTestList && sandboxTestOn && sandboxRuntime) {
    if (!canAccessSandboxTest()) return false;
    return !isTourBlockedByUserState(tour, userId, userStates, now, TourEnvironment.SANDBOX);
  }

  if (sources.inProductionList && prodOn) {
    if (sandboxRuntime && sandboxTestOn && sources.inSandboxTestList) {
      return false;
    }
    return !isTourBlockedByUserState(tour, userId, userStates, now, TourEnvironment.PRODUCTION);
  }

  return false;
}

export function isTourBlockedByUserState(
  tour: GuidedTour,
  userId: string,
  userStates: TourUserState[],
  now: Date,
  audienceEnvironment?: TourEnvironment,
): boolean {
  const state = findTourUserStateForAudience(tour, userStates, audienceEnvironment);
  if (!state) {
    return false;
  }

  if (state.status !== TourUserStateStatus.DISMISSED && state.status !== TourUserStateStatus.COMPLETED) {
    return false;
  }

  if (state.resetVersion < (tour.currentResetVersion || 0)) {
    return false;
  }

  if (tour.replayPolicy === TourReplayPolicy.ALWAYS_ON_NEW_VERSION) {
    return true;
  }

  if (tour.replayPolicy === TourReplayPolicy.AFTER_PERIOD) {
    const nextEligibleAt = state.nextEligibleAt
      ? new Date(state.nextEligibleAt)
      : computeNextEligibleAtFromTour(tour, state.updatedAt);
    return Boolean(nextEligibleAt && now < nextEligibleAt);
  }

  if (tour.replayPolicy === TourReplayPolicy.NEVER) {
    return true;
  }

  return false;
}

export function computeNextEligibleAtFromTour(tour: GuidedTour, baseDate: Date): Date | null {
  if (tour.replayPolicy !== TourReplayPolicy.AFTER_PERIOD || !tour.replayAfterDays || tour.replayAfterDays <= 0) {
    return null;
  }
  const next = new Date(baseDate);
  next.setDate(next.getDate() + tour.replayAfterDays);
  return next;
}

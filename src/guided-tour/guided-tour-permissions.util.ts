import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../user/entities/user.entity';
import type { RequestAuthUser } from '../auth/types/request-auth-user.type';
import type { SdkTokenScope } from '../auth/sdk-token-scopes';
import {
  GuidedTour,
  TourEnvironment,
  TourSandboxStatus,
} from './entities/guided-tour.entity';
import type { CreateGuidedTourDto } from './dto/create-guided-tour.dto';
import type { UpdateGuidedTourDto } from './dto/update-guided-tour.dto';
import {
  isDeveloperOnlyAutogenTour,
  isDeveloperOwnedTestTour,
  assertSdkLabTemplateWorkflowBlocked,
  isSdkLabTemplateTour,
} from './guided-tour-lab.util';
import {
  canCollaborationPeerToggleSandboxTest,
  canMutateTourWithGrants,
  canViewOnlyActorToggleSandboxTest,
  resolveEditorAccessMode,
  type TourWithAccessGrants,
} from './guided-tour-access.util';
import {
  isAdminOriginatedTour,
  isProductionManagerAdmin,
  normalizeAssignedAdminIds,
} from './guided-tour-visibility.util';

export function isTourProductionDeployment(tour: Pick<GuidedTour, 'environment'>): boolean {
  return tour.environment === TourEnvironment.PRODUCTION;
}

const PRODUCTION_STRUCTURED_UPDATE_FIELDS = [
  'name',
  'description',
  'targetUrl',
  'steps',
  'priority',
  'triggerConditions',
  'simulationContext',
  'replayPolicy',
  'replayAfterDays',
] as const satisfies ReadonlyArray<keyof UpdateGuidedTourDto>;

export function assertProductionTourStructuredUpdateAllowed(
  tour: Pick<GuidedTour, 'environment'>,
  updateTourDto: UpdateGuidedTourDto,
): void {
  if (!isTourProductionDeployment(tour)) {
    return;
  }
  for (const field of PRODUCTION_STRUCTURED_UPDATE_FIELDS) {
    if (updateTourDto[field] !== undefined) {
      throw new BadRequestException(
        'Ce parcours est en production : repassez en sandbox pour le modifier, le dupliquer ou le supprimer.',
      );
    }
  }
}

export function assertProductionTourLifecycleMutationAllowed(
  tour: Pick<GuidedTour, 'environment'>,
): void {
  if (isTourProductionDeployment(tour)) {
    throw new BadRequestException(
      'Ce parcours est en production : repassez en sandbox pour le modifier, le dupliquer ou le supprimer.',
    );
  }
}

export function assertCollaborationPeerUpdateAllowed(
  tour: TourWithAccessGrants,
  updateTourDto: UpdateGuidedTourDto,
  actor?: TourPermissionActor,
): void {
  if (!actor?.id || tour.createdBy === actor.id) {
    return;
  }
  if (resolveEditorAccessMode(tour, actor) !== 'collaborate') {
    return;
  }
  assertDeveloperSandboxUpdateAllowed(updateTourDto);
}

/** Transfert sandbox ↔ prod : propriétaire admin pour ses parcours ; modérateur pour les parcours développeur. */
export function canAdminTransferTourEnvironment(
  tour: TourWithAccessGrants,
  actor?: TourPermissionActor,
): boolean {
  if (isSdkLabTemplateTour(tour)) {
    return false;
  }
  if (!isAdminActor(actor)) {
    return false;
  }
  if (isAdminOriginatedTour(tour)) {
    if (isTourProductionDeployment(tour)) {
      return isProductionManagerAdmin(tour, actor?.id);
    }
    return tour.createdBy === actor?.id;
  }
  if (tour.createdBy === actor?.id) {
    return true;
  }
  return resolveEditorAccessMode(tour, actor) === 'admin';
}

export type TourPermissionActor = Pick<RequestAuthUser, 'id' | 'role'>;

export type TourRuntimeContext = {
  userId?: string;
  userRole?: UserRole | 'SDK_TOKEN';
  authMethod?: RequestAuthUser['authMethod'];
  scopes?: SdkTokenScope[];
};

const DEVELOPER_IMMUTABLE_UPDATE_FIELDS = [
  'environment',
] as const satisfies ReadonlyArray<keyof UpdateGuidedTourDto>;

export function isAdminActor(actor?: TourPermissionActor): boolean {
  return actor?.role === UserRole.ADMIN;
}

export function isDeveloperActor(actor?: TourPermissionActor): boolean {
  return actor?.role === UserRole.DEVELOPER;
}

export function isSdkTokenActor(actor?: TourPermissionActor): boolean {
  return actor?.role === 'SDK_TOKEN';
}

export function isDeveloperOwnedSandboxTour(
  tour: Pick<GuidedTour, 'createdBy' | 'environment'>,
  userId?: string,
): boolean {
  return Boolean(userId) && tour.createdBy === userId && tour.environment === TourEnvironment.SANDBOX;
}

export function isDeveloperOwnedAwaitingAdminDecision(
  tour: Pick<GuidedTour, 'createdBy' | 'environment' | 'sandboxStatus' | 'assignedAdminIds'>,
  userId?: string,
): boolean {
  return (
    isDeveloperOwnedSandboxTour(tour, userId) &&
    tour.sandboxStatus === TourSandboxStatus.PENDING &&
    normalizeAssignedAdminIds(tour.assignedAdminIds).length > 0
  );
}

export function canDeveloperMutateTour(
  tour: Pick<
    GuidedTour,
    'createdBy' | 'environment' | 'sandboxStatus' | 'assignedAdminIds' | 'targetUrl' | 'triggerConditions'
  >,
  actor?: TourPermissionActor,
): boolean {
  if (!isDeveloperActor(actor) || !actor?.id) {
    return false;
  }
  if (isDeveloperOwnedSandboxTour(tour, actor.id)) {
    if (tour.sandboxStatus === TourSandboxStatus.APPROVED) {
      return false;
    }
    if (isDeveloperOwnedAwaitingAdminDecision(tour, actor.id)) {
      return false;
    }
    return true;
  }
  if (isSdkLabTemplateTour(tour)) {
    return false;
  }
  return isDeveloperOwnedTestTour(tour, actor.id);
}

export function assertCanMutateTour(
  tour: Pick<
    GuidedTour,
    | 'createdBy'
    | 'environment'
    | 'sandboxStatus'
    | 'assignedAdminIds'
    | 'targetUrl'
    | 'triggerConditions'
  >,
  actor?: TourPermissionActor,
): void {
  if (!actor) {
    throw new ForbiddenException('Authentification requise pour modifier ce parcours.');
  }
  assertSdkLabTemplateWorkflowBlocked(tour);
  if (isAdminActor(actor)) {
    return;
  }
  if (canDeveloperMutateTour(tour, actor)) {
    return;
  }
  throw new ForbiddenException('Vous ne pouvez modifier que vos parcours sandbox ou ceux publiés depuis le lab SDK.');
}

export function assertDeveloperCannotSetProductionOnCreate(
  createTourDto: CreateGuidedTourDto,
  actor?: TourPermissionActor,
): void {
  if (!isDeveloperActor(actor)) {
    return;
  }
  if (createTourDto.environment === TourEnvironment.PRODUCTION) {
    throw new ForbiddenException('Les développeurs ne peuvent créer que des parcours sandbox.');
  }
}

export function assertDeveloperSandboxUpdateAllowed(
  updateTourDto: UpdateGuidedTourDto,
): void {
  for (const field of DEVELOPER_IMMUTABLE_UPDATE_FIELDS) {
    if (updateTourDto[field] !== undefined) {
      throw new ForbiddenException(
        `Les développeurs ne peuvent pas modifier l'environnement d'un parcours sandbox via l'API.`,
      );
    }
  }
}

/**
 * Curation Aide > Guides : seuls les ADMIN peuvent activer `showInGuides`.
 * `false` / omission restent autorisés pour tout acteur (défaut sûr).
 */
export function resolveShowInGuidesForWrite(
  requested: boolean | undefined,
  actor?: TourPermissionActor,
): boolean | undefined {
  if (requested === undefined) {
    return undefined;
  }
  if (isAdminActor(actor)) {
    return requested;
  }
  if (requested === true) {
    throw new ForbiddenException(
      'Seul un administrateur peut afficher un parcours dans Guides (Aide).',
    );
  }
  return false;
}

export function assertDeveloperUpdateAllowed(
  tour: Pick<
    GuidedTour,
    'createdBy' | 'environment' | 'sandboxStatus' | 'targetUrl' | 'triggerConditions'
  > &
    TourWithAccessGrants,
  updateTourDto: UpdateGuidedTourDto,
  actor?: TourPermissionActor,
): void {
  if (!isDeveloperActor(actor)) {
    return;
  }

  if (isDeveloperOwnedSandboxTour(tour, actor?.id)) {
    assertDeveloperSandboxUpdateAllowed(updateTourDto);
    return;
  }

  if (isSdkLabTemplateTour(tour)) {
    throw new ForbiddenException(
      'Les parcours générés par le lab SDK sont des templates de test et ne peuvent pas être modifiés depuis l’éditeur.',
    );
  }

  if (
    resolveEditorAccessMode(tour, actor) === 'collaborate' &&
    canMutateTourWithGrants(tour, actor)
  ) {
    assertDeveloperSandboxUpdateAllowed(updateTourDto);
    return;
  }

  throw new ForbiddenException('Modification non autorisée sur ce parcours.');
}

export type TourActivationAudience = 'sandbox' | 'production';

export function assertCanToggleTourActive(
  tour: Pick<
    GuidedTour,
    'createdBy' | 'environment' | 'sandboxStatus' | 'targetUrl' | 'triggerConditions'
  > &
    TourWithAccessGrants,
  actor?: TourPermissionActor,
  audience: TourActivationAudience = 'production',
): void {
  if (!actor) {
    throw new ForbiddenException('Authentification requise.');
  }

  if (audience === 'sandbox' && canViewOnlyActorToggleSandboxTest(tour, actor)) {
    return;
  }

  if (audience === 'sandbox' && canCollaborationPeerToggleSandboxTest(tour, actor)) {
    return;
  }

  if (isDeveloperActor(actor)) {
    if (audience === 'production') {
      throw new ForbiddenException('Les développeurs ne peuvent activer que le mode test sandbox.');
    }
    if (!isDeveloperOwnedTestTour(tour, actor.id)) {
      throw new ForbiddenException('Vous ne pouvez activer que vos propres parcours sandbox pour test.');
    }
    if (
      isDeveloperOwnedSandboxTour(tour, actor.id) &&
      tour.sandboxStatus === TourSandboxStatus.APPROVED
    ) {
      throw new ForbiddenException(
        'Ce parcours a été approuvé : seul un administrateur peut le gérer ou le tester.',
      );
    }
    if (isDeveloperOwnedAwaitingAdminDecision(tour, actor.id)) {
      throw new ForbiddenException(
        'Ce parcours est en attente de modération : les actions de test sont verrouillées jusqu’à la décision de l’administrateur.',
      );
    }
    return;
  }

  if (isAdminActor(actor)) {
    if (resolveEditorAccessMode(tour, actor) === 'collaborate') {
      throw new ForbiddenException(
        'En tant que collaborateur invité, vous ne pouvez pas activer la production sur ce parcours.',
      );
    }
    if (tour.environment === TourEnvironment.SANDBOX) {
      if (audience === 'production') {
        throw new BadRequestException(
          'Ce parcours est encore en sandbox : activez-le pour test avant approbation.',
        );
      }
      return;
    }
    return;
  }

  throw new ForbiddenException('Vous ne pouvez activer que vos propres parcours sandbox pour test.');
}

export function assertAdminCannotSetProductionOnCreate(
  createTourDto: CreateGuidedTourDto,
  actor?: TourPermissionActor,
): void {
  if (!isAdminActor(actor)) {
    return;
  }
  if (createTourDto.environment === TourEnvironment.PRODUCTION) {
    throw new ForbiddenException(
      'Les administrateurs créent toujours en sandbox. Passez en production via le sélecteur sur la carte du parcours.',
    );
  }
}

/**
 * Création : développeurs, administrateurs et tokens SDK d’intégration démarrent toujours en sandbox.
 * L’approbation workflow valide le parcours en sandbox (approved) ; la promotion prod se fait via le switcher carte (admin).
 */
export function resolveCreateTourEnvironment(
  createTourDto: CreateGuidedTourDto,
  actor?: TourPermissionActor,
): { environment: TourEnvironment; sandboxStatus: TourSandboxStatus | null } {
  if (isDeveloperActor(actor) || isAdminActor(actor) || isSdkTokenActor(actor)) {
    return {
      environment: TourEnvironment.SANDBOX,
      sandboxStatus: TourSandboxStatus.PENDING,
    };
  }

  const environment = createTourDto.environment ?? TourEnvironment.PRODUCTION;
  if (environment === TourEnvironment.SANDBOX) {
    return {
      environment: TourEnvironment.SANDBOX,
      sandboxStatus: TourSandboxStatus.PENDING,
    };
  }

  return {
    environment: TourEnvironment.PRODUCTION,
    sandboxStatus: null,
  };
}

export function hasSandboxRuntimeAccess(runtime?: TourRuntimeContext): boolean {
  if (!runtime?.userId) {
    return false;
  }
  if (runtime.userRole === UserRole.DEVELOPER || runtime.userRole === UserRole.ADMIN) {
    return true;
  }
  return Boolean(runtime.scopes?.includes('tours:sandbox'));
}

export function assertCanApproveSandboxTour(
  tour: Pick<GuidedTour, 'environment' | 'sandboxStatus'>,
  actor?: TourPermissionActor,
): void {
  if (!isAdminActor(actor)) {
    throw new ForbiddenException('Seuls les administrateurs peuvent approuver un parcours sandbox.');
  }
  if (tour.environment !== TourEnvironment.SANDBOX || tour.sandboxStatus !== TourSandboxStatus.PENDING) {
    throw new BadRequestException('Ce parcours n’est pas en attente d’approbation sandbox.');
  }
}

export function assertCanRejectSandboxTour(
  tour: Pick<GuidedTour, 'environment' | 'sandboxStatus'>,
  actor?: TourPermissionActor,
): void {
  if (!isAdminActor(actor)) {
    throw new ForbiddenException('Seuls les administrateurs peuvent rejeter un parcours sandbox.');
  }
  if (tour.environment !== TourEnvironment.SANDBOX || tour.sandboxStatus !== TourSandboxStatus.PENDING) {
    throw new BadRequestException('Ce parcours n’est pas en attente d’approbation sandbox.');
  }
}

export function assertCanReopenApprovedDeveloperTour(
  tour: Pick<
    GuidedTour,
    | 'environment'
    | 'sandboxStatus'
    | 'createdBy'
    | 'developerPrivate'
    | 'assignedAdminIds'
    | 'targetUrl'
    | 'triggerConditions'
  >,
): void {
  if (tour.environment !== TourEnvironment.SANDBOX) {
    throw new BadRequestException(
      'Repassez le parcours en sandbox avant de le renvoyer au développeur.',
    );
  }
  if (tour.sandboxStatus !== TourSandboxStatus.APPROVED) {
    throw new BadRequestException('Ce parcours n’est pas approuvé en sandbox.');
  }
}

export function assertCanReassignApprovedTourAdmins(
  tour: Pick<GuidedTour, 'sandboxStatus'>,
): void {
  if (tour.sandboxStatus !== TourSandboxStatus.APPROVED) {
    throw new BadRequestException(
      'La réassignation admin est disponible uniquement pour les parcours approuvés.',
    );
  }
}

export function assertCanTransferApprovedDeveloperTour(
  tour: Pick<GuidedTour, 'environment' | 'sandboxStatus'>,
): void {
  if (tour.environment !== TourEnvironment.SANDBOX) {
    throw new BadRequestException(
      'Le transfert vers un autre développeur n’est pas autorisé pour un parcours en production.',
    );
  }
  if (tour.sandboxStatus !== TourSandboxStatus.APPROVED) {
    throw new BadRequestException(
      'Le transfert développeur est disponible uniquement pour les parcours approuvés.',
    );
  }
}

export function assertCanAdminTransferToProduction(
  tour: Pick<GuidedTour, 'environment' | 'sandboxStatus'>,
): void {
  if (tour.environment !== TourEnvironment.SANDBOX) {
    return;
  }
  if (tour.sandboxStatus === TourSandboxStatus.REJECTED) {
    throw new BadRequestException(
      'Un parcours rejeté ne peut pas être promu en production. Le développeur doit corriger et resoumettre ; approuvez-le une fois en attente.',
    );
  }
  if (tour.sandboxStatus === TourSandboxStatus.RETURNED) {
    throw new BadRequestException(
      'Un parcours renvoyé au développeur ne peut pas être promu en production. Réassignez-le à un administrateur après correction.',
    );
  }
}

export function filterProductionRuntimeTours(
  tours: GuidedTour[],
  userId?: string,
): GuidedTour[] {
  return tours.filter((tour) => {
    if (tour.environment === TourEnvironment.SANDBOX) {
      return false;
    }
    if (isDeveloperOnlyAutogenTour(tour) && !isDeveloperOwnedTestTour(tour, userId)) {
      return false;
    }
    return true;
  });
}

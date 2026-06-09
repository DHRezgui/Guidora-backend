import { ForbiddenException } from '@nestjs/common';
import type { OrganizationJourneyBlueprintAccessGrant } from './entities/organization-journey-blueprint-access-grant.entity';
import { BlueprintAccessMode } from './entities/organization-journey-blueprint-access-grant.entity';
import type { OrganizationJourneyBlueprint } from './entities/organization-journey-blueprint.entity';
import {
  BlueprintPermissionActor,
  isBlueprintOwner,
} from './blueprint-permissions.util';

export type BlueprintWithAccessGrants = Pick<OrganizationJourneyBlueprint, 'createdBy'> & {
  accessGrants?: OrganizationJourneyBlueprintAccessGrant[];
};

export function hasBlueprintAccessGrant(
  row: BlueprintWithAccessGrants,
  actorId: string | undefined,
  mode: BlueprintAccessMode,
): boolean {
  if (!actorId) {
    return false;
  }
  return (row.accessGrants ?? []).some(
    (grant) => grant.userId === actorId && grant.accessMode === mode,
  );
}

export function canModifyBlueprint(
  row: BlueprintWithAccessGrants,
  actor?: BlueprintPermissionActor,
): boolean {
  if (!actor?.id) {
    return false;
  }
  return isBlueprintOwner(row, actor) || hasBlueprintAccessGrant(row, actor.id, BlueprintAccessMode.MODIFY);
}

export function canPublishBlueprint(
  row: BlueprintWithAccessGrants,
  actor?: BlueprintPermissionActor,
): boolean {
  if (!actor?.id) {
    return false;
  }
  return isBlueprintOwner(row, actor) || hasBlueprintAccessGrant(row, actor.id, BlueprintAccessMode.PUBLISH);
}

export function canManageBlueprintAccess(
  row: Pick<OrganizationJourneyBlueprint, 'createdBy'>,
  actor?: BlueprintPermissionActor,
): boolean {
  return isBlueprintOwner(row, actor);
}

export function assertCanModifyBlueprint(
  row: BlueprintWithAccessGrants,
  actor?: BlueprintPermissionActor,
): void {
  if (!canModifyBlueprint(row, actor)) {
    throw new ForbiddenException(
      'Seul le propriétaire ou un administrateur autorisé peut modifier ce blueprint.',
    );
  }
}

export function assertCanPublishBlueprint(
  row: BlueprintWithAccessGrants,
  actor?: BlueprintPermissionActor,
): void {
  if (!canPublishBlueprint(row, actor)) {
    throw new ForbiddenException(
      'Seul le propriétaire ou un administrateur autorisé peut publier ce blueprint.',
    );
  }
}

export function assertCanManageBlueprintAccess(
  row: Pick<OrganizationJourneyBlueprint, 'createdBy'>,
  actor?: BlueprintPermissionActor,
): void {
  if (!canManageBlueprintAccess(row, actor)) {
    throw new ForbiddenException('Seul le propriétaire du blueprint peut gérer les autorisations.');
  }
}

export function blueprintSharingHasMode(
  grants: OrganizationJourneyBlueprintAccessGrant[] | undefined,
  mode: BlueprintAccessMode,
): boolean {
  return Boolean(grants?.some((grant) => grant.accessMode === mode));
}

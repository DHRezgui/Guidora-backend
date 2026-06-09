import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../user/entities/user.entity';
import type { OrganizationJourneyBlueprint } from './entities/organization-journey-blueprint.entity';

export type BlueprintPermissionActor = {
  id: string;
  role: UserRole;
};

export function isBlueprintOwner(
  row: Pick<OrganizationJourneyBlueprint, 'createdBy'>,
  actor?: BlueprintPermissionActor,
): boolean {
  if (!actor?.id) {
    return false;
  }
  if (!row.createdBy) {
    return true;
  }
  return row.createdBy === actor.id;
}

export function assertCanManageBlueprints(actor?: BlueprintPermissionActor): void {
  if (!actor?.id) {
    throw new ForbiddenException('Authentification requise.');
  }
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenException('Seuls les administrateurs peuvent gérer les blueprints.');
  }
}

export function assertCanDeleteBlueprint(
  row: Pick<OrganizationJourneyBlueprint, 'createdBy'>,
  actor?: BlueprintPermissionActor,
): void {
  assertCanManageBlueprints(actor);
  if (!isBlueprintOwner(row, actor)) {
    throw new ForbiddenException('Seul le propriétaire du blueprint peut le supprimer.');
  }
}

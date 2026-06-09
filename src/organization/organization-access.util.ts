import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../user/entities/user.entity';

type OrganizationAccessActor = {
  role?: UserRole;
  organizationId?: string | null;
};

/** ADMIN → toutes les orgs ; DEVELOPER → la sienne uniquement. */
export function assertDeveloperOrganizationAccess(
  actor: OrganizationAccessActor | undefined,
  organizationId: string,
): void {
  if (actor?.role !== UserRole.DEVELOPER) {
    return;
  }

  if (!actor.organizationId) {
    throw new ForbiddenException('Aucune organisation associée à cet utilisateur.');
  }

  if (actor.organizationId !== organizationId) {
    throw new ForbiddenException('Accès refusé à cette organisation.');
  }
}

export function shouldListAllOrganizations(actor: OrganizationAccessActor | undefined): boolean {
  return actor?.role === UserRole.ADMIN;
}

export function getDeveloperOrganizationId(
  actor: OrganizationAccessActor | undefined,
): string | null {
  if (actor?.role !== UserRole.DEVELOPER) {
    return null;
  }
  return actor.organizationId ?? null;
}

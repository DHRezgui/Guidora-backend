import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../user/entities/user.entity';

export type MembershipActor = {
  id?: string;
  role?: UserRole;
  organizationId?: string | null;
};

/** Rôles gérés par un admin organisation (chef d'équipe). */
export const TEAM_MEMBER_ROLES: readonly UserRole[] = [
  UserRole.DEVELOPER,
  UserRole.USER,
];

/** Rôles gérés par le super administrateur plateforme. */
export const PLATFORM_MANAGED_USER_ROLES: readonly UserRole[] = [UserRole.ADMIN];

export function isSuperAdmin(role?: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN;
}

export function isOrgAdmin(role?: UserRole): boolean {
  return role === UserRole.ADMIN;
}

export function isDeveloper(role?: UserRole): boolean {
  return role === UserRole.DEVELOPER;
}

export function isTeamMemberRole(role?: UserRole): boolean {
  return role === UserRole.DEVELOPER || role === UserRole.USER;
}

export function isPlatformManagedUserRole(role?: UserRole): boolean {
  return role === UserRole.ADMIN;
}

/** ADMIN ou DEVELOPER rattaché à une organisation cliente. */
export function isOrganizationMember(role?: UserRole): boolean {
  return isOrgAdmin(role) || isDeveloper(role);
}

export function canManagePlatformOrganizations(role?: UserRole): boolean {
  return isSuperAdmin(role);
}

/** Super admin : gestion des comptes administrateur par organisation. */
export function canManagePlatformAdmins(actor?: MembershipActor): boolean {
  return isSuperAdmin(actor?.role);
}

/** Admin organisation : gestion des développeurs et utilisateurs de son équipe. */
export function canManageTeamMembers(actor?: MembershipActor): boolean {
  return isOrgAdmin(actor?.role) && Boolean(actor?.organizationId);
}

/** @deprecated Utiliser canManagePlatformAdmins ou canManageTeamMembers */
export function canManageOrganizationUsers(actor?: MembershipActor): boolean {
  return canManagePlatformAdmins(actor) || canManageTeamMembers(actor);
}

export function getAssignableRolesForActor(actor?: MembershipActor): UserRole[] {
  if (isSuperAdmin(actor?.role)) {
    return [UserRole.ADMIN];
  }
  if (canManageTeamMembers(actor)) {
    return [...TEAM_MEMBER_ROLES];
  }
  return [];
}

export function getMembershipOrganizationId(actor?: MembershipActor): string | null {
  if (!actor?.role || isSuperAdmin(actor.role)) {
    return null;
  }
  if (isOrganizationMember(actor.role)) {
    return actor.organizationId ?? null;
  }
  return null;
}

export function shouldListAllOrganizations(actor?: MembershipActor): boolean {
  return isSuperAdmin(actor?.role);
}

export function assertOrganizationScopedAccess(
  actor: MembershipActor | undefined,
  organizationId: string,
): void {
  if (isSuperAdmin(actor?.role)) {
    return;
  }
  if (!actor?.organizationId) {
    throw new ForbiddenException('Aucune organisation associée à cet utilisateur.');
  }
  if (actor.organizationId !== organizationId) {
    throw new ForbiddenException('Accès refusé à cette organisation.');
  }
}

export function assertCanAssignUserRole(actor: MembershipActor | undefined, role?: UserRole): void {
  if (!role) {
    return;
  }
  if (role === UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('Ce rôle ne peut pas être attribué via l’interface.');
  }
  const allowed = getAssignableRolesForActor(actor);
  if (!allowed.includes(role)) {
    if (isSuperAdmin(actor?.role)) {
      throw new ForbiddenException(
        'Seul le rôle administrateur organisation peut être attribué.',
      );
    }
    if (isOrgAdmin(actor?.role)) {
      throw new ForbiddenException(
        'Seuls les rôles développeur et utilisateur peuvent être attribués.',
      );
    }
    throw new ForbiddenException('Accès refusé.');
  }
}

export function assertTargetUserInActorScope(
  actor: MembershipActor | undefined,
  target: { id?: string; organizationId?: string | null; role?: UserRole },
): void {
  if (!actor?.id) {
    throw new ForbiddenException('Authentification requise.');
  }
  if (target.id === actor.id) {
    return;
  }
  if (isDeveloper(actor.role)) {
    if (!actor.organizationId || target.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Accès refusé à cet utilisateur.');
    }
    return;
  }
  if (isSuperAdmin(actor.role)) {
    if (!isPlatformManagedUserRole(target.role)) {
      throw new ForbiddenException(
        'Seuls les administrateurs organisation peuvent être gérés.',
      );
    }
    return;
  }
  if (!canManageTeamMembers(actor)) {
    throw new ForbiddenException('Accès refusé.');
  }
  if (!actor.organizationId || target.organizationId !== actor.organizationId) {
    throw new ForbiddenException('Cet utilisateur n’appartient pas à votre organisation.');
  }
  if (!isTeamMemberRole(target.role)) {
    throw new ForbiddenException('Seuls les membres de l’équipe peuvent être gérés.');
  }
}

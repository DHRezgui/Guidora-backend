import {
  assertOrganizationScopedAccess,
  getMembershipOrganizationId,
  shouldListAllOrganizations,
  type MembershipActor,
} from '../common/membership-roles.util';

export type OrganizationAccessActor = MembershipActor;

/** @deprecated Utiliser assertOrganizationScopedAccess */
export function assertDeveloperOrganizationAccess(
  actor: OrganizationAccessActor | undefined,
  organizationId: string,
): void {
  assertOrganizationScopedAccess(actor, organizationId);
}

export { shouldListAllOrganizations, getMembershipOrganizationId };

/** @deprecated Utiliser getMembershipOrganizationId */
export function getDeveloperOrganizationId(actor: OrganizationAccessActor | undefined): string | null {
  return getMembershipOrganizationId(actor);
}

import { UserRole } from '../user/entities/user.entity';
import {
  assertCanAssignUserRole,
  assertTargetUserInActorScope,
  canManagePlatformAdmins,
  canManageTeamMembers,
  getAssignableRolesForActor,
} from './membership-roles.util';

describe('membership-roles.util', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';

  describe('canManagePlatformAdmins / canManageTeamMembers', () => {
    it('allows super admin platform admin management only', () => {
      expect(canManagePlatformAdmins({ role: UserRole.SUPER_ADMIN })).toBe(true);
      expect(canManageTeamMembers({ role: UserRole.SUPER_ADMIN })).toBe(false);
    });

    it('allows org admin team management only', () => {
      expect(
        canManageTeamMembers({ role: UserRole.ADMIN, organizationId: orgId }),
      ).toBe(true);
      expect(canManagePlatformAdmins({ role: UserRole.ADMIN, organizationId: orgId })).toBe(
        false,
      );
    });
  });

  describe('getAssignableRolesForActor', () => {
    it('returns ADMIN for super admin', () => {
      expect(getAssignableRolesForActor({ role: UserRole.SUPER_ADMIN })).toEqual([
        UserRole.ADMIN,
      ]);
    });

    it('returns DEVELOPER and USER for org admin', () => {
      expect(
        getAssignableRolesForActor({ role: UserRole.ADMIN, organizationId: orgId }),
      ).toEqual([UserRole.DEVELOPER, UserRole.USER]);
    });
  });

  describe('assertCanAssignUserRole', () => {
    it('blocks super admin from assigning developer', () => {
      expect(() =>
        assertCanAssignUserRole({ role: UserRole.SUPER_ADMIN }, UserRole.DEVELOPER),
      ).toThrow('Seul le rôle administrateur organisation');
    });

    it('blocks org admin from assigning admin', () => {
      expect(() =>
        assertCanAssignUserRole(
          { role: UserRole.ADMIN, organizationId: orgId },
          UserRole.ADMIN,
        ),
      ).toThrow('Seuls les rôles développeur et utilisateur');
    });
  });

  describe('assertTargetUserInActorScope', () => {
    it('allows super admin to manage org admin accounts', () => {
      expect(() =>
        assertTargetUserInActorScope(
          { id: 'super-1', role: UserRole.SUPER_ADMIN },
          { id: 'admin-1', role: UserRole.ADMIN, organizationId: orgId },
        ),
      ).not.toThrow();
    });

    it('denies super admin managing developers', () => {
      expect(() =>
        assertTargetUserInActorScope(
          { id: 'super-1', role: UserRole.SUPER_ADMIN },
          { id: 'dev-1', role: UserRole.DEVELOPER, organizationId: orgId },
        ),
      ).toThrow('Seuls les administrateurs organisation');
    });

    it('allows org admin to manage team members in same org', () => {
      expect(() =>
        assertTargetUserInActorScope(
          { id: 'admin-1', role: UserRole.ADMIN, organizationId: orgId },
          { id: 'dev-1', role: UserRole.DEVELOPER, organizationId: orgId },
        ),
      ).not.toThrow();
    });

    it('denies org admin managing other admins', () => {
      expect(() =>
        assertTargetUserInActorScope(
          { id: 'admin-1', role: UserRole.ADMIN, organizationId: orgId },
          { id: 'admin-2', role: UserRole.ADMIN, organizationId: orgId },
        ),
      ).toThrow('Seuls les membres de l’équipe');
    });
  });
});

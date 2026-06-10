import { UserRole } from '../user/entities/user.entity';
import {
  assertDeveloperOrganizationAccess,
  getMembershipOrganizationId,
  shouldListAllOrganizations,
} from './organization-access.util';

describe('organization-access.util', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';

  describe('assertDeveloperOrganizationAccess', () => {
    it('allows SUPER_ADMIN on any organization', () => {
      expect(() =>
        assertDeveloperOrganizationAccess({ role: UserRole.SUPER_ADMIN }, orgId),
      ).not.toThrow();
    });

    it('allows ADMIN on own organization', () => {
      expect(() =>
        assertDeveloperOrganizationAccess(
          { role: UserRole.ADMIN, organizationId: orgId },
          orgId,
        ),
      ).not.toThrow();
    });

    it('denies ADMIN on another organization', () => {
      expect(() =>
        assertDeveloperOrganizationAccess(
          { role: UserRole.ADMIN, organizationId: 'other-org' },
          orgId,
        ),
      ).toThrow('Accès refusé à cette organisation.');
    });

    it('allows DEVELOPER on own organization', () => {
      expect(() =>
        assertDeveloperOrganizationAccess(
          { role: UserRole.DEVELOPER, organizationId: orgId },
          orgId,
        ),
      ).not.toThrow();
    });
  });

  describe('shouldListAllOrganizations', () => {
    it('returns true only for SUPER_ADMIN', () => {
      expect(shouldListAllOrganizations({ role: UserRole.SUPER_ADMIN })).toBe(true);
      expect(shouldListAllOrganizations({ role: UserRole.ADMIN })).toBe(false);
      expect(shouldListAllOrganizations({ role: UserRole.DEVELOPER })).toBe(false);
    });
  });

  describe('getMembershipOrganizationId', () => {
    it('returns organization for ADMIN and DEVELOPER', () => {
      expect(
        getMembershipOrganizationId({ role: UserRole.ADMIN, organizationId: orgId }),
      ).toBe(orgId);
      expect(
        getMembershipOrganizationId({ role: UserRole.DEVELOPER, organizationId: orgId }),
      ).toBe(orgId);
    });

    it('returns null for SUPER_ADMIN', () => {
      expect(
        getMembershipOrganizationId({ role: UserRole.SUPER_ADMIN, organizationId: orgId }),
      ).toBeNull();
    });
  });
});

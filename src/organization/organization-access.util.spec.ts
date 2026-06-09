import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../user/entities/user.entity';
import {
  assertDeveloperOrganizationAccess,
  getDeveloperOrganizationId,
  shouldListAllOrganizations,
} from './organization-access.util';

describe('organization-access.util', () => {
  const orgId = '123e4567-e89b-12d3-a456-426614174000';

  describe('assertDeveloperOrganizationAccess', () => {
    it('allows ADMIN on any organization', () => {
      expect(() =>
        assertDeveloperOrganizationAccess({ role: UserRole.ADMIN }, orgId),
      ).not.toThrow();
    });

    it('allows DEVELOPER on own organization', () => {
      expect(() =>
        assertDeveloperOrganizationAccess(
          { role: UserRole.DEVELOPER, organizationId: orgId },
          orgId,
        ),
      ).not.toThrow();
    });

    it('forbids DEVELOPER without organization', () => {
      expect(() =>
        assertDeveloperOrganizationAccess({ role: UserRole.DEVELOPER }, orgId),
      ).toThrow(ForbiddenException);
    });

    it('forbids DEVELOPER on another organization', () => {
      expect(() =>
        assertDeveloperOrganizationAccess(
          { role: UserRole.DEVELOPER, organizationId: 'other-org-id' },
          orgId,
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('shouldListAllOrganizations', () => {
    it('returns true for ADMIN', () => {
      expect(shouldListAllOrganizations({ role: UserRole.ADMIN })).toBe(true);
    });

    it('returns false for DEVELOPER', () => {
      expect(shouldListAllOrganizations({ role: UserRole.DEVELOPER })).toBe(false);
    });
  });

  describe('getDeveloperOrganizationId', () => {
    it('returns organizationId for DEVELOPER', () => {
      expect(
        getDeveloperOrganizationId({
          role: UserRole.DEVELOPER,
          organizationId: orgId,
        }),
      ).toBe(orgId);
    });

    it('returns null for ADMIN', () => {
      expect(getDeveloperOrganizationId({ role: UserRole.ADMIN, organizationId: orgId })).toBeNull();
    });
  });
});

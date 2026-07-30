import { ForbiddenException } from '@nestjs/common';
import { TourEnvironment, TourSandboxStatus } from './entities/guided-tour.entity';
import { UserRole } from '../user/entities/user.entity';
import {
  resolveCreateTourEnvironment,
  resolveShowInGuidesForWrite,
} from './guided-tour-permissions.util';

describe('guided-tour-permissions.util', () => {
  describe('resolveCreateTourEnvironment', () => {
    it('should force sandbox for SDK integration tokens', () => {
      const result = resolveCreateTourEnvironment(
        { name: 'Auto tour', targetUrl: '/', steps: [] },
        { id: 'token-owner', role: 'SDK_TOKEN' },
      );

      expect(result).toEqual({
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
      });
    });

    it('should ignore explicit production environment for SDK integration tokens', () => {
      const result = resolveCreateTourEnvironment(
        {
          name: 'Auto tour',
          targetUrl: '/',
          environment: TourEnvironment.PRODUCTION,
          steps: [],
        },
        { id: 'token-owner', role: 'SDK_TOKEN' },
      );

      expect(result).toEqual({
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
      });
    });

    it('should keep sandbox-first for developers and admins', () => {
      for (const role of [UserRole.DEVELOPER, UserRole.ADMIN]) {
        const result = resolveCreateTourEnvironment(
          { name: 'Dashboard tour', targetUrl: '/app', steps: [] },
          { id: 'user-1', role },
        );

        expect(result).toEqual({
          environment: TourEnvironment.SANDBOX,
          sandboxStatus: TourSandboxStatus.PENDING,
        });
      }
    });
  });

  describe('resolveShowInGuidesForWrite', () => {
    it('allows admin to set true or false', () => {
      expect(
        resolveShowInGuidesForWrite(true, { id: 'admin-1', role: UserRole.ADMIN }),
      ).toBe(true);
      expect(
        resolveShowInGuidesForWrite(false, { id: 'admin-1', role: UserRole.ADMIN }),
      ).toBe(false);
    });

    it('allows developer to set false or omit', () => {
      expect(
        resolveShowInGuidesForWrite(false, { id: 'dev-1', role: UserRole.DEVELOPER }),
      ).toBe(false);
      expect(
        resolveShowInGuidesForWrite(undefined, { id: 'dev-1', role: UserRole.DEVELOPER }),
      ).toBeUndefined();
    });

    it('rejects developer enabling Guides', () => {
      expect(() =>
        resolveShowInGuidesForWrite(true, { id: 'dev-1', role: UserRole.DEVELOPER }),
      ).toThrow(ForbiddenException);
    });
  });
});

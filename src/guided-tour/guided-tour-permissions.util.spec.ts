import { TourEnvironment, TourSandboxStatus } from './entities/guided-tour.entity';
import { UserRole } from '../user/entities/user.entity';
import { resolveCreateTourEnvironment } from './guided-tour-permissions.util';

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
});

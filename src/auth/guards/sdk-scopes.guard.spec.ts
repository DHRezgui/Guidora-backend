import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_DASHBOARD_JWT_ON_SDK_ROUTE_KEY } from '../decorators/allow-dashboard-jwt-on-sdk-route.decorator';
import { REQUIRE_SDK_SCOPES_KEY } from '../decorators/require-sdk-scopes.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';
import { SdkScopesGuard } from './sdk-scopes.guard';

describe('SdkScopesGuard', () => {
  let guard: SdkScopesGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  const buildContext = (user?: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new SdkScopesGuard(reflector as unknown as Reflector);
  });

  it('allows JWT on routes without SDK scope metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = buildContext({ authMethod: 'jwt', role: 'ADMIN' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects JWT on SDK-scoped routes', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === REQUIRE_SDK_SCOPES_KEY || key === 'require_sdk_scopes') {
        return ['tours:runtime'];
      }
      return undefined;
    });
    const ctx = buildContext({
      authMethod: 'jwt',
      role: 'ADMIN',
      id: 'user-1',
      organizationId: 'org-1',
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows dashboard JWT on SDK routes marked AllowDashboardJwtOnSdkRoute with matching role', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === REQUIRE_SDK_SCOPES_KEY || key === 'require_sdk_scopes') {
        return ['blueprints:read'];
      }
      if (key === ALLOW_DASHBOARD_JWT_ON_SDK_ROUTE_KEY || key === 'allow_dashboard_jwt_on_sdk_route') {
        return true;
      }
      if (key === ROLES_KEY || key === 'roles') {
        return [UserRole.ADMIN, UserRole.DEVELOPER];
      }
      return undefined;
    });
    const ctx = buildContext({
      authMethod: 'jwt',
      role: UserRole.ADMIN,
      id: 'user-1',
      organizationId: 'org-1',
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows integration PAT with required scopes', () => {
    reflector.getAllAndOverride.mockReturnValue(['tours:runtime']);
    const ctx = buildContext({
      authMethod: 'sdk_token',
      role: 'SDK_TOKEN',
      id: 'creator-1',
      organizationId: 'org-1',
      scopes: ['tours:runtime', 'tours:sandbox'],
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows BFF session token with required scopes', () => {
    reflector.getAllAndOverride.mockReturnValue(['tours:runtime']);
    const ctx = buildContext({
      authMethod: 'sdk_session',
      role: 'SDK_TOKEN',
      id: 'creator-1',
      organizationId: 'org-1',
      scopes: ['tours:runtime', 'feedback:write'],
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects integration PAT missing scopes', () => {
    reflector.getAllAndOverride.mockReturnValue(['feedback:write']);
    const ctx = buildContext({
      authMethod: 'sdk_token',
      role: 'SDK_TOKEN',
      scopes: ['tours:runtime'],
    });

    expect(() => guard.canActivate(ctx)).toThrow(/missing required scope/i);
  });
});

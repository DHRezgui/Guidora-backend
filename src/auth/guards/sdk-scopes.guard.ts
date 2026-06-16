import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_DASHBOARD_JWT_ON_SDK_ROUTE_KEY } from '../decorators/allow-dashboard-jwt-on-sdk-route.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { REQUIRE_SDK_SCOPES_KEY } from '../decorators/require-sdk-scopes.decorator';
import { UserRole } from '../../user/entities/user.entity';
import type { RequestAuthUser } from '../types/request-auth-user.type';
import type { SdkTokenScope } from '../sdk-token-scopes';

@Injectable()
export class SdkScopesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestAuthUser | undefined;
    const required = this.reflector.getAllAndOverride<SdkTokenScope[] | undefined>(
      REQUIRE_SDK_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      if (user?.authMethod === 'sdk_token' || user?.authMethod === 'sdk_session') {
        throw new ForbiddenException(
          'This route is not available for SDK integration tokens.',
        );
      }
      return true;
    }

    if (!user) {
      throw new ForbiddenException('Authentification requise.');
    }

    if (user.authMethod === 'jwt') {
      const allowDashboardJwt = this.reflector.getAllAndOverride<boolean>(
        ALLOW_DASHBOARD_JWT_ON_SDK_ROUTE_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (allowDashboardJwt) {
        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
          context.getHandler(),
          context.getClass(),
        ]);
        if (
          requiredRoles?.length &&
          requiredRoles.some((role) => user.role === role)
        ) {
          return true;
        }
      }

      throw new ForbiddenException(
        'Cette route SDK requiert un token d’intégration (td_sdk_...). ' +
          'Les JWT de session ne sont pas autorisés — créez un PAT dans Paramètres → Tokens SDK.',
      );
    }

    if (user.authMethod !== 'sdk_token' && user.authMethod !== 'sdk_session') {
      throw new ForbiddenException('Authentification SDK invalide.');
    }

    const held = new Set(user.scopes ?? []);
    const missing = required.filter((scope) => !held.has(scope));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `SDK token missing required scope(s): ${missing.join(', ')}`,
      );
    }

    return true;
  }
}

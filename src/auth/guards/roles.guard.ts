import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ALLOW_SDK_SCOPES_KEY } from '../decorators/allow-sdk-scopes.decorator';
import { UserRole } from '../../user/entities/user.entity';
import type { RequestAuthUser } from '../types/request-auth-user.type';
import type { SdkTokenScope } from '../sdk-token-scopes';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const authUser = user as RequestAuthUser | undefined;
    if (!authUser) {
      return false;
    }

    if (authUser.authMethod === 'sdk_token') {
      const allowSdk = this.reflector.getAllAndOverride<SdkTokenScope[] | undefined>(
        ALLOW_SDK_SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (allowSdk?.length) {
        const held = new Set(authUser.scopes ?? []);
        return allowSdk.every((scope) => held.has(scope));
      }
      return false;
    }

    return requiredRoles.some((role) => authUser.role === role);
  }
}

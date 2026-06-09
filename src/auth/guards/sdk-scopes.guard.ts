import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_SDK_SCOPES_KEY } from '../decorators/require-sdk-scopes.decorator';
import type { RequestAuthUser } from '../types/request-auth-user.type';
import type { SdkTokenScope } from '../sdk-token-scopes';

@Injectable()
export class SdkScopesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestAuthUser | undefined;
    if (!user || user.authMethod !== 'sdk_token') {
      return true;
    }

    const required = this.reflector.getAllAndOverride<SdkTokenScope[] | undefined>(
      REQUIRE_SDK_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      throw new ForbiddenException(
        'This route is not available for SDK integration tokens.',
      );
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

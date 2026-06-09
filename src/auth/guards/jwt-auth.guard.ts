import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SdkIntegrationTokenService } from '../sdk-integration-token.service';
import { SDK_TOKEN_PREFIX } from '../sdk-token-scopes';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private sdkIntegrationTokenService: SdkIntegrationTokenService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const bearer = authHeader.slice(7).trim();
      if (bearer.startsWith(SDK_TOKEN_PREFIX)) {
        const principal = await this.sdkIntegrationTokenService.validateBearerToken(bearer);
        if (!principal) {
          throw new UnauthorizedException('Invalid SDK integration token');
        }
        request.user = principal;
        return true;
      }
    }

    const result = await super.canActivate(context);
    return result as boolean;
  }
}

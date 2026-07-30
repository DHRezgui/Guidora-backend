import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';
import { JwtPayload } from '../types/jwt-payload.type';
import { resolveJwtSecret } from '../jwt-secret.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Compte désactivé');
    }

    // Retourner l'utilisateur (sera attaché à req.user)
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      authMethod: 'jwt' as const,
    };
  }
}
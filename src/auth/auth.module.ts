// src/auth/auth.module.ts
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SdkIntegrationTokenController } from './sdk-integration-token.controller';
import { SdkIntegrationTokenService } from './sdk-integration-token.service';
import { SdkIntegrationTokenAuditService } from './sdk-integration-token-audit.service';
import { SdkSessionTokenService } from './sdk-session-token.service';
import { SdkIntegrationToken } from './entities/sdk-integration-token.entity';
import { SdkIntegrationTokenAudit } from './entities/sdk-integration-token-audit.entity';
import { SdkSessionToken } from './entities/sdk-session-token.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserModule } from '../user/user.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SdkScopesGuard } from './guards/sdk-scopes.guard';
import { MailModule } from '../mail/mail.module';
import { resolveJwtSecret } from './jwt-secret.util';

@Global()
@Module({
  imports: [
    UserModule,
    MailModule,
    TypeOrmModule.forFeature([
      SdkIntegrationToken,
      SdkIntegrationTokenAudit,
      SdkSessionToken,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: resolveJwtSecret(configService),
        signOptions: {
          expiresIn: '1h', 
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, SdkIntegrationTokenController],
  providers: [
    AuthService,
    SdkIntegrationTokenService,
    SdkIntegrationTokenAuditService,
    SdkSessionTokenService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    SdkScopesGuard,
  ],
  exports: [
    AuthService,
    SdkIntegrationTokenService,
    SdkIntegrationTokenAuditService,
    SdkSessionTokenService,
    JwtAuthGuard,
    RolesGuard,
    SdkScopesGuard,
  ],
})
export class AuthModule {}
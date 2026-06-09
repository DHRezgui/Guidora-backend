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
import { SdkIntegrationToken } from './entities/sdk-integration-token.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserModule } from '../user/user.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SdkScopesGuard } from './guards/sdk-scopes.guard';
import { MailModule } from '../mail/mail.module';

@Global()
@Module({
  imports: [
    UserModule,
    MailModule,
    TypeOrmModule.forFeature([SdkIntegrationToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
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
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    SdkScopesGuard,
  ],
  exports: [AuthService, SdkIntegrationTokenService, JwtAuthGuard, RolesGuard, SdkScopesGuard],
})
export class AuthModule {}
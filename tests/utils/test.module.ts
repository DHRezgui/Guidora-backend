import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './../../src/user/user.module';
import { OrganizationModule } from './../../src/organization/organization.module';
import { AuthModule } from './../../src/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from './../../src/auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.test',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'dhia',
      password: process.env.DB_PASSWORD || 'dhiadhia12',
      database: process.env.DB_NAME || 'onboarding',
      entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
      synchronize: true,
      dropSchema: false,
      logging: false,
      uuidExtension: 'pgcrypto',
    }),
    UserModule,
    OrganizationModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class TestModule {}





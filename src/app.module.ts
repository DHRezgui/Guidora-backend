import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { UserModule } from './user/user.module';
import { OrganizationModule } from './organization/organization.module';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { GuidedTourModule } from './guided-tour/guided-tour.module';
import { StepModule } from './step/step.module';
import { TrackingModule } from './tracking/tracking.module';
import { RedisModule } from './redis/redis.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { BehaviorAnalysisModule } from './behavior-analysis/behavior-analysis.module';
import { MailModule } from './mail/mail.module';
import { User } from './user/entities/user.entity';
import { Organization } from './organization/entities/organization.entity';
import { GuidedTour } from './guided-tour/entities/guided-tour.entity';
import { Step } from './step/entities/step.entity';
import { BehaviorEvent } from './tracking/entities/behavior_event.entity';
import { BehaviorAnalysis } from './behavior-analysis/entities/behavior-analysis.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    RedisModule.forRoot({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: 0,
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'admin',
      password: process.env.DB_PASSWORD || 'password123',
      database: process.env.DB_NAME || 'onboarding',
      entities: [User, Organization, GuidedTour, Step, BehaviorEvent, BehaviorAnalysis],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
      uuidExtension: 'pgcrypto',
    }),
    UserModule,
    OrganizationModule,
    AuthModule,
    MailModule,
    GuidedTourModule,
    StepModule,
    TrackingModule,
    RabbitmqModule,
    BehaviorAnalysisModule,
  ],
  controllers: [AppController],  
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Protège toutes les routes par défaut
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
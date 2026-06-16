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
import { SdkScopesGuard } from './auth/guards/sdk-scopes.guard';
import { SdkIntegrationToken } from './auth/entities/sdk-integration-token.entity';
import { SdkIntegrationTokenAudit } from './auth/entities/sdk-integration-token-audit.entity';
import { SdkSessionToken } from './auth/entities/sdk-session-token.entity';
import { GuidedTourModule } from './guided-tour/guided-tour.module';
import { StepModule } from './step/step.module';
import { TrackingModule } from './tracking/tracking.module';
import { RedisModule } from './redis/redis.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { BehaviorAnalysisModule } from './behavior-analysis/behavior-analysis.module';
import { MailModule } from './mail/mail.module';
import { FaqModule } from './faq/faq.module';
import { User } from './user/entities/user.entity';
import { Organization } from './organization/entities/organization.entity';
import { GuidedTour } from './guided-tour/entities/guided-tour.entity';
import { TourUserState } from './guided-tour/entities/tour-user-state.entity';
import { ContextualFeedbackAggregate } from './guided-tour/entities/contextual-feedback-aggregate.entity';
import { OrganizationJourneyBlueprint } from './guided-tour/entities/organization-journey-blueprint.entity';
import { OrganizationJourneyBlueprintAccessGrant } from './guided-tour/entities/organization-journey-blueprint-access-grant.entity';
import { GuidedTourAccessGrant } from './guided-tour/entities/guided-tour-access-grant.entity';
import { GuidedTourDeveloperTransfer } from './guided-tour/entities/guided-tour-developer-transfer.entity';
import { Step } from './step/entities/step.entity';
import { BehaviorEvent } from './tracking/entities/behavior_event.entity';
import { BehaviorAnalysis } from './behavior-analysis/entities/behavior-analysis.entity';
import { DataAggregationModule } from './data-aggregation/data-aggregation.module';
import { MlModule } from './ml/ml.module';

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
      entities: [
        User,
        Organization,
        GuidedTour,
        TourUserState,
        Step,
        BehaviorEvent,
        BehaviorAnalysis,
        ContextualFeedbackAggregate,
        OrganizationJourneyBlueprint,
        OrganizationJourneyBlueprintAccessGrant,
        GuidedTourAccessGrant,
        GuidedTourDeveloperTransfer,
        SdkIntegrationToken,
        SdkIntegrationTokenAudit,
        SdkSessionToken,
      ],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
      uuidExtension: 'pgcrypto',
    }),
    UserModule,
    OrganizationModule,
    AuthModule,
    MailModule,
    FaqModule,
    GuidedTourModule,
    StepModule,
    TrackingModule,
    RabbitmqModule,
    BehaviorAnalysisModule,
    DataAggregationModule,
    MlModule,
  ],
  controllers: [AppController],  
  providers: [
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: SdkScopesGuard,
    },
  ],
})
export class AppModule {}
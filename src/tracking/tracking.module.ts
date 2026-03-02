import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingAnalyticsController } from './tracking-analytics.controller';
import { TrackingService } from './tracking.service';
import { AsyncTrackingService } from './async-tracking.service';
import { OrganizationModule } from '../organization/organization.module';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BehaviorEvent } from './entities/behavior_event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BehaviorEvent]),
    OrganizationModule,
    RabbitmqModule,
  ],
  controllers: [TrackingController, TrackingAnalyticsController],
  providers: [TrackingService, AsyncTrackingService],
  exports: [TrackingService, AsyncTrackingService],
})
export class TrackingModule {}

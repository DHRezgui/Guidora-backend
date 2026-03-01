import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { OrganizationModule } from '../organization/organization.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BehaviorEvent } from './entities/behavior_event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BehaviorEvent]),
    OrganizationModule,
  ],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}

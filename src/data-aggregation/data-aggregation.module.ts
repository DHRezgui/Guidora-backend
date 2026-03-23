import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataAggregationService } from './data-aggregation.service';
import { BehaviorEvent } from '../tracking/entities/behavior_event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BehaviorEvent])],
  providers: [DataAggregationService],
  exports: [DataAggregationService],
})
export class DataAggregationModule {}

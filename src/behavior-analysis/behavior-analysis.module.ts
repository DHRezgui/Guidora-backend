import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BehaviorAnalysisController } from './behavior-analysis.controller';
import { BehaviorAnalysisService } from './behavior-analysis.service';
import { BehaviorAnalysis } from './entities/behavior-analysis.entity';
import { BehaviorEvent } from '../tracking/entities/behavior_event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BehaviorAnalysis, BehaviorEvent]),
  ],
  controllers: [BehaviorAnalysisController],
  providers: [BehaviorAnalysisService],
  exports: [BehaviorAnalysisService],
})
export class BehaviorAnalysisModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MlController } from './ml.controller';
import { DatasetGeneratorService } from './dataset-generator.service';
import { FeatureEngineeringService } from './feature-engineering.service';
import { BehaviorAnalysis } from '../behavior-analysis/entities/behavior-analysis.entity';
import { BehaviorAnalysisModule } from '../behavior-analysis/behavior-analysis.module';

@Module({
  imports: [TypeOrmModule.forFeature([BehaviorAnalysis]), BehaviorAnalysisModule],
  providers: [DatasetGeneratorService, FeatureEngineeringService],
  controllers: [MlController],
  exports: [DatasetGeneratorService, FeatureEngineeringService],
})
export class MlModule {}

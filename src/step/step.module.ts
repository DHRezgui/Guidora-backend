import { Module } from '@nestjs/common';
import { StepController } from './step.controller';
import { StepService } from './step.service';
import { Step } from './entities/step.entity';
import { GuidedTour } from '../guided-tour/entities/guided-tour.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Step, GuidedTour])],
  controllers: [StepController],
  providers: [StepService],
  exports: [StepService],
})
export class StepModule {}

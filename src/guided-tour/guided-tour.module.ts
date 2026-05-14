import { Module } from '@nestjs/common';
import { GuidedTourController } from './guided-tour.controller';
import { GuidedTourService } from './guided-tour.service';
import { ContextualFeedbackService } from './contextual-feedback.service';
import { Step } from '../step/entities/step.entity';
import { GuidedTour } from './entities/guided-tour.entity';
import { TourUserState } from './entities/tour-user-state.entity';
import { ContextualFeedbackAggregate } from './entities/contextual-feedback-aggregate.entity';
import { User } from '../user/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GuidedTour,
      TourUserState,
      Step,
      User,
      ContextualFeedbackAggregate,
    ]),
    OrganizationModule,
  ],
  controllers: [GuidedTourController],
  providers: [GuidedTourService, ContextualFeedbackService],
  exports: [GuidedTourService, ContextualFeedbackService],
})
export class GuidedTourModule {}

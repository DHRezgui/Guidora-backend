import { Module } from '@nestjs/common';
import { GuidedTourController } from './guided-tour.controller';
import { GuidedTourService } from './guided-tour.service';
import { ContextualFeedbackService } from './contextual-feedback.service';
import { TourSemanticPythonWorkerService } from './tour-semantic-python-worker.service';
import { Step } from '../step/entities/step.entity';
import { GuidedTour } from './entities/guided-tour.entity';
import { TourUserState } from './entities/tour-user-state.entity';
import { ContextualFeedbackAggregate } from './entities/contextual-feedback-aggregate.entity';
import { OrganizationJourneyBlueprint } from './entities/organization-journey-blueprint.entity';
import { OrganizationJourneyBlueprintAccessGrant } from './entities/organization-journey-blueprint-access-grant.entity';
import { GuidedTourAccessGrant } from './entities/guided-tour-access-grant.entity';
import { GuidedTourDeveloperTransfer } from './entities/guided-tour-developer-transfer.entity';
import { User } from '../user/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationModule } from '../organization/organization.module';
import { ContextualJourneyBlueprintService } from './contextual-journey-blueprint.service';
import { FaqModule } from '../faq/faq.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GuidedTour,
      TourUserState,
      Step,
      User,
      ContextualFeedbackAggregate,
      OrganizationJourneyBlueprint,
      OrganizationJourneyBlueprintAccessGrant,
      GuidedTourAccessGrant,
      GuidedTourDeveloperTransfer,
    ]),
    OrganizationModule,
    FaqModule,
  ],
  controllers: [GuidedTourController],
  providers: [
    GuidedTourService,
    ContextualFeedbackService,
    TourSemanticPythonWorkerService,
    ContextualJourneyBlueprintService,
  ],
  exports: [
    GuidedTourService,
    ContextualFeedbackService,
    TourSemanticPythonWorkerService,
    ContextualJourneyBlueprintService,
  ],
})
export class GuidedTourModule {}

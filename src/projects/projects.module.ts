import { Module } from '@nestjs/common';
import { FaqModule } from '../faq/faq.module';
import { GuidedTourModule } from '../guided-tour/guided-tour.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [FaqModule, GuidedTourModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}

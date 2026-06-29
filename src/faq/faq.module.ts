import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { FaqController } from './faq.controller';
import { FaqEntryService } from './faq-entry.service';
import { FaqItem } from './entities/faq-item.entity';
import { FaqService } from './faq.service';

@Module({
  imports: [TypeOrmModule.forFeature([FaqItem, User])],
  controllers: [FaqController],
  providers: [FaqService, FaqEntryService],
  exports: [FaqService, FaqEntryService],
})
export class FaqModule {}

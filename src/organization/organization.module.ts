import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';


@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  exports: [OrganizationService, TypeOrmModule],
  controllers: [OrganizationController],
  providers: [OrganizationService]
})
export class OrganizationModule {}

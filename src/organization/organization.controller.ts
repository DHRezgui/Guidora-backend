import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationWithUsers } from './types/organization-with-users.type';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  // Créer une organisation
  @Roles(UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createOrganizationDto: CreateOrganizationDto) {
    const organization = await this.organizationService.create(createOrganizationDto);
    return {
      success: true,
      message: 'Organisation créée avec succès',
      organization,
    };
  }

  // Récupérer toutes les organisations
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    const organizations = await this.organizationService.findAll();
    return {
      success: true,
      count: organizations.length,
      organizations,
    };
  }

  // Récupérer une organisation par ID
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const organization = await this.organizationService.findById(id);
    return {
      success: true,
      organization,
    };
  }

  // Récupérer une organisation avec ses utilisateurs
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get(':id/users')
  @HttpCode(HttpStatus.OK)
  async findByIdWithUsers(@Param('id', ParseUUIDPipe) id: string): Promise<{ success: boolean; organization: OrganizationWithUsers }> {
    const organization = await this.organizationService.findByIdWithUsers(id);
    return {
      success: true,
      organization,
    };
  }

  // Compter les utilisateurs d'une organisation
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Get(':id/users/count')
  @HttpCode(HttpStatus.OK)
  async countUsers(@Param('id', ParseUUIDPipe) id: string) {
    const count = await this.organizationService.countUsers(id);
    return {
      success: true,
      count,
    };
  }

  // Mettre à jour une organisation
  @Roles(UserRole.ADMIN)
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    const organization = await this.organizationService.update(id, updateOrganizationDto);
    return {
      success: true,
      message: 'Organisation mise à jour avec succès',
      organization,
    };
  }

  // Supprimer une organisation
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.organizationService.delete(id);
    return {
      success: true,
      message: 'Organisation supprimée avec succès',
    };
  }
}
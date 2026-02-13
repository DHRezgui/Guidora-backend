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

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  // Créer une organisation
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
  @Get(':id/users')
  @HttpCode(HttpStatus.OK)
  async findByIdWithUsers(@Param('id', ParseUUIDPipe) id: string) {
    const organization = await this.organizationService.findByIdWithUsers(id);
    return {
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        userCount: organization.users?.length || 0,
        users: organization.users || [],
      },
    };
  }

  // Compter les utilisateurs d'une organisation
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
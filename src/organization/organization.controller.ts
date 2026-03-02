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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ApiAuth } from '../swagger/security-schemas';
import { error } from 'console';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  // Créer une organisation
  @Roles(UserRole.ADMIN)
  @ApiAuth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Création d\'une organisation',
    description: 'Crée une nouvelle organisation cliente avec sa clé API'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Organisation créée',
    schema: {
      example: {
        success: true,
        message: 'Organisation créée avec succès',
        organization: {
          id: 'org-uuid',
          name: 'Acme Corporation',
          apiKey: 'onb_acme_xyz123',
          plan: 'PRO',
          maxTours: 50,
          maxUsers: 500,
          isActive: true,
          createdAt: '2026-02-15T10:30:00.000Z'
        }
      }
    }
  })
  @ApiResponse({ status: 409, description: 'Clé API déjà utilisée', example: {
    statusCode: 409,
    message: 'Cette clé API est déjà utilisée'
  }})
  @ApiResponse({ status: 403, description: 'Accès refusé - Vous n\'avez pas les droits nécessaires', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
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
  @ApiAuth()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Liste des organisations',
    description: 'Retourne toutes les organisations (ADMIN: toutes / DEVELOPER: lecture seule)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Liste des organisations',
    schema: {
      example: {
        success: true,
        count: 2,
        organizations: [
          {
            id: 'org-uuid-1',
            name: 'Trustdev',
            apiKey: 'onb_trustdev_xyz123',
            plan: 'PRO',
            domain: 'trustdev.com',
            settings: {
              theme: 'dark',
              language: 'fr'
            },
            maxTours: 50,
            maxUsers: 500,
            isActive: true,
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z',
          },
          {
            id: 'org-uuid-2',
            name: 'Beta Inc',
            apiKey: 'onb_beta_abc456',
            plan: 'STARTER',
            domain: 'beta.com',
            settings: {
              theme: 'light',
              language: 'en'
            },
            maxTours: 10,
            maxUsers: 100,
            isActive: true,
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z'
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Accès refusé - Vous n\'avez pas les droits nécessaires', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})         
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
  @ApiAuth()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Détails d\'une organisation',
    description: 'Retourne les informations détaillées d\'une organisation'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ 
    status: 200, 
    description: 'Organisation trouvée',
    schema: {
      example: {
        success: true,
        organization: {
          id: 'org-uuid',
          name: 'Acme Corporation',
          apiKey: 'onb_acme_xyz123',
          plan: 'PRO',
          domain: 'acme.com',
          settings: {},
          maxTours: 50,
          maxUsers: 500,
          isActive: true,
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-15T10:30:00.000Z'
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Organisation non trouvée', example: {
    message: 'Organisation introuvable',
    error: 'Not Found',
    statusCode: 404,
  }})
  @ApiResponse({ status: 403, description: 'Accès refusé - Vous n\'avez pas les droits nécessaires', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const organization = await this.organizationService.findById(id);
    return {
      success: true,
      organization,
    };
  }

  // Récupérer une organisation avec ses utilisateurs
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get(':id/users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Utilisateurs d\'une organisation',
    description: 'Retourne les utilisateurs associés à une organisation (sans mots de passe)'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ 
    status: 200, 
    description: 'Utilisateurs trouvés',
    schema: {
      example: {
        success: true,
        organization: {
          id: 'org-uuid',
          name: 'Acme Corporation',
          apiKey: 'onb_acme_xyz123',
          plan: 'PRO',
          domain: 'acme.com',
          settings: {},
          maxTours: 50,
          maxUsers: 500,
          isActive: true,
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-15T10:30:00.000Z',
          userCount: 3,
          users: [
            {
              id: 'user-uuid-1',
              email: 'john.doe@acme.com',
              firstName: 'John',
              lastName: 'Doe',
              role: 'ADMIN',
              organizationId: 'org-uuid',
              isActive: true,
              emailVerified: false,
              lastLoginAt: '2026-02-15T10:30:00.000Z',
              createdAt: '2026-02-15T10:30:00.000Z',
              updatedAt: '2026-02-15T10:30:00.000Z'
            }
          ]
        }
      }
    }
  })
  
  @ApiResponse({ status: 403, description: 'Accès refusé - Vous n\'avez pas les droits nécessaires', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'Organisation introuvable', example: {
    message: 'Organisation introuvable',
    error: 'Not Found',
    statusCode: 404,
  }})
  async findByIdWithUsers(@Param('id', ParseUUIDPipe) id: string): Promise<{ success: boolean; organization: OrganizationWithUsers }> {
    const organization = await this.organizationService.findByIdWithUsers(id);
    return {
      success: true,
      organization,
    };
  }

  // Compter les utilisateurs d'une organisation
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get(':id/users/count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Nombre d\'utilisateurs',
    description: 'Retourne le nombre d\'utilisateurs actifs dans une organisation'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ 
    status: 200, 
    description: 'Comptage effectué',
    schema: {
      example: {
        success: true,
        count: 3
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Accès refusé - Vous n\'avez pas les droits nécessaires', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'Organisation introuvable', example: {
    message: 'Organisation introuvable',
    error: 'Not Found',
    statusCode: 404,
  }})
  async countUsers(@Param('id', ParseUUIDPipe) id: string) {
    const count = await this.organizationService.countUsers(id);
    return {
      success: true,
      count,
    };
  }

  // Mettre à jour une organisation
  @Roles(UserRole.ADMIN)
  @ApiAuth()
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Mise à jour d\'une organisation',
    description: 'Met à jour les informations d\'une organisation (ADMIN uniquement)'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ status: 200, description: 'Organisation mise à jour', schema: {
    example: {
      success: true,
      message: 'Organisation mise à jour avec succès',
      organization: {
        id: 'org-uuid',
        name: 'Acme Corp',
        domain: 'acme.com',
        createdAt: '2026-02-15T10:30:00.000Z',
        updatedAt: '2026-02-15T10:30:00.000Z',
      }
    }
  }})
  @ApiResponse({ status: 403, description: 'Accès refusé - Vous n\'avez pas les droits nécessaires', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'Organisation introuvable', example: {
    message: 'Organisation introuvable',
    error: 'Not Found',
    statusCode: 404,
  }})
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
  @ApiAuth()
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Suppression d\'une organisation',
    description: 'Supprime définitivement une organisation et désaffecte ses utilisateurs'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ status: 200, description: 'Organisation supprimée avec succès', schema: {
    example: {
      success: true,
      message: 'Organisation supprimée avec succès',
    }
  }})
  @ApiResponse({ status: 404, description: 'Organisation introuvable', example: {
    message: 'Organisation introuvable',
    error: 'Not Found',
    statusCode: 404,
  }})
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.organizationService.delete(id);
    return {
      success: true,
      message: 'Organisation supprimée avec succès',
    };
  }
}
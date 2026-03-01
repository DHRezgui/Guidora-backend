import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, UseGuards, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../user/entities/user.entity';
import { GuidedTourService } from './guided-tour.service';
import { CreateGuidedTourDto } from './dto/create-guided-tour.dto';
import { UpdateGuidedTourDto } from './dto/update-guided-tour.dto';
import { GuidedTour } from './entities/guided-tour.entity';
import { ApiAuth } from '../swagger/security-schemas';

@ApiTags('Guided Tour')
@Controller('tours')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class GuidedTourController {
  constructor(private readonly tourService: GuidedTourService) {}

  // Créer un parcours (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Créer un nouveau parcours guidé',
    description: 'Crée un parcours complet avec ses étapes pour une organisation'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Parcours créé avec succès',
    schema: {
      example: {
        success: true,
        message: 'Parcours créé avec succès',
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'Premier virement',
          description: 'Guide pas-à-pas pour effectuer votre premier virement bancaire',
          targetUrl: '/dashboard/transfers',
          isActive: true,
          priority: 10,
          triggerConditions: {
            minTimeOnPage: 30,
            requiredElements: ['#transfer-button'],
            userSegment: 'new_user',
          },
          organizationId: 'org-uuid',
          createdBy: 'user-uuid',
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-15T10:30:00.000Z',
          steps: [
            {
              id: 'step-uuid-1',
              orderIndex: 1,
              title: 'Bienvenue !',
              content: 'Cliquez ici pour commencer votre premier virement',
              targetSelector: '#transfer-button',
              position: 'BOTTOM',
              action: 'CLICK',
              skipAllowed: true,
              highlightElement: true,
            }
          ]
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Accès refusé - Rôle ADMIN requis', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async create(
    @Body() createTourDto: CreateGuidedTourDto,
    @CurrentUser() user: any,
  ) {
    const tour = await this.tourService.create(
      createTourDto,
      user.organizationId || user.organizations?.[0]?.id,
      user.id,
    );
    return {
      success: true,
      message: 'Parcours créé avec succès',
      tour,
    };
  }

  // Lister les parcours d'une organisation
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Lister les parcours d\'une organisation',
    description: 'Retourne tous les parcours (actifs/inactifs) de l\'organisation de l\'utilisateur'
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filtrer par statut actif (true = actifs uniquement, false = inactifs uniquement)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Liste des parcours',
    schema: {
      example: {
        success: true,
        count: 2,
        tours: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            name: 'Premier virement',
            description: 'Guide pas-à-pas pour effectuer votre premier virement bancaire',
            targetUrl: '/dashboard/transfers',
            isActive: true,
            priority: 10,
            triggerConditions: { minTimeOnPage: 30 },
            organizationId: 'org-uuid',
            createdBy: 'user-uuid',
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z',
            steps: [
              {
                id: 'step-uuid-1',
                orderIndex: 1,
                title: 'Bienvenue !',
                content: 'Cliquez ici pour commencer',
                targetSelector: '#transfer-button',
                position: 'BOTTOM',
                action: 'CLICK',
                skipAllowed: true,
                highlightElement: true,
              }
            ]
          },
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            name: 'Découverte du tableau de bord',
            description: 'Présentation des fonctionnalités principales',
            targetUrl: '/dashboard',
            isActive: false,
            priority: 5,
            triggerConditions: {},
            organizationId: 'org-uuid',
            createdBy: 'user-uuid',
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z',
            steps: []
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Accès refusé - Vous n\'avez pas les droits nécessaires', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async findAll(
    @CurrentUser() user: any,
    @Query('isActive') isActive?: boolean,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const tours = await this.tourService.findAllByOrganization(organizationId, isActive);
    return {
      success: true,
      count: tours.length,
      tours,
    };
  }

  // Trouver les parcours actifs pour une URL (pour le SDK)
  @Get('active/url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Parcours actifs pour une URL',
    description: 'Retourne les parcours actifs correspondant à une URL cible (utilisé par le SDK client)'
  })
  @ApiQuery({ name: 'url', required: true, type: String, description: 'L\'URL de la page pour laquelle chercher les parcours actifs', example: '/dashboard/transfers' })
  @ApiResponse({ 
    status: 200, 
    description: 'Parcours actifs trouvés pour cette URL',
    schema: {
      example: {
        success: true,
        count: 1,
        tours: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            name: 'Premier virement',
            description: 'Guide pas-à-pas pour effectuer votre premier virement bancaire',
            targetUrl: '/dashboard/transfers',
            isActive: true,
            priority: 10,
            triggerConditions: { minTimeOnPage: 30 },
            organizationId: 'org-uuid',
            createdBy: 'user-uuid',
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z',
            steps: [
              {
                id: 'step-uuid-1',
                orderIndex: 1,
                title: 'Bienvenue !',
                content: 'Cliquez ici pour commencer',
                targetSelector: '#transfer-button',
                position: 'BOTTOM',
                action: 'CLICK',
                skipAllowed: true,
                highlightElement: true,
              }
            ]
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Accès refusé - Vous n\'avez pas les droits nécessaires', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async findActiveForUrl(
    @Query('url') url: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const tours = await this.tourService.findActiveToursForUrl(url, organizationId);
    return {
      success: true,
      count: tours.length,
      tours,
    };
  }

  // Détails d'un parcours
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Détails d\'un parcours',
    description: 'Retourne les informations détaillées d\'un parcours avec ses étapes'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Parcours trouvé',
    schema: {
      example: {
        success: true,
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'Premier virement',
          description: 'Guide pas-à-pas pour effectuer votre premier virement bancaire',
          targetUrl: '/dashboard/transfers',
          isActive: true,
          priority: 10,
          triggerConditions: { minTimeOnPage: 30 },
          organizationId: 'org-uuid',
          createdBy: 'user-uuid',
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-15T10:30:00.000Z',
          steps: [
            {
              id: 'step-uuid-1',
              orderIndex: 1,
              title: 'Bienvenue !',
              content: 'Cliquez ici pour commencer',
              targetSelector: '#transfer-button',
              position: 'BOTTOM',
              action: 'CLICK',
              skipAllowed: true,
              highlightElement: true,
            }
          ]
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Parcours non trouvé', schema: {
    example: {
      message: 'Parcours introuvable',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Accès refusé - Vous n\'avez pas les droits nécessaires', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const tour = await this.tourService.findById(id, organizationId);
    return {
      success: true,
      tour,
    };
  }

  // Mettre à jour un parcours (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Mettre à jour un parcours',
    description: 'Met à jour les informations et étapes d\'un parcours existant'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Parcours mis à jour',
    schema: {
      example: {
        success: true,
        message: 'Parcours mis à jour avec succès',
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'Premier virement (modifié)',
          description: 'Description mise à jour',
          targetUrl: '/dashboard/transfers',
          isActive: true,
          priority: 20,
          triggerConditions: { minTimeOnPage: 60 },
          organizationId: 'org-uuid',
          createdBy: 'user-uuid',
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-16T14:00:00.000Z',
          steps: []
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Parcours non trouvé', schema: {
    example: {
      message: 'Parcours introuvable',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Accès refusé - Rôle ADMIN requis', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTourDto: UpdateGuidedTourDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const tour = await this.tourService.update(id, updateTourDto, organizationId);
    return {
      success: true,
      message: 'Parcours mis à jour avec succès',
      tour,
    };
  }

  // Activer/désactiver un parcours (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Put(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Activer/désactiver un parcours',
    description: 'Change le statut actif/inactif d\'un parcours sans le supprimer'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Statut du parcours mis à jour',
    schema: {
      example: {
        success: true,
        message: 'Parcours activé',
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'Premier virement',
          description: 'Guide pas-à-pas pour effectuer votre premier virement bancaire',
          targetUrl: '/dashboard/transfers',
          isActive: true,
          priority: 10,
          triggerConditions: {},
          organizationId: 'org-uuid',
          createdBy: 'user-uuid',
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-16T14:00:00.000Z',
          steps: []
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Parcours non trouvé', schema: {
    example: {
      message: 'Parcours introuvable',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Accès refusé - Rôle ADMIN requis', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async toggleActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const tour = await this.tourService.toggleActive(id, organizationId, isActive);
    return {
      success: true,
      message: isActive ? 'Parcours activé' : 'Parcours désactivé',
      tour,
    };
  }

  // Supprimer un parcours (soft delete - ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Supprimer un parcours',
    description: 'Désactive un parcours (soft delete) pour le masquer des utilisateurs finaux'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Parcours désactivé avec succès',
    schema: {
      example: {
        success: true,
        message: 'Parcours désactivé avec succès',
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Parcours non trouvé', schema: {
    example: {
      message: 'Parcours introuvable',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Accès refusé - Rôle ADMIN requis', schema: {
    example: {
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403
    }
  }})
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    await this.tourService.delete(id, organizationId);
    return {
      success: true,
      message: 'Parcours désactivé avec succès',
    };
  }

}
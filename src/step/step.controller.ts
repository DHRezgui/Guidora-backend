// src/step/step.controller.ts
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
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../user/entities/user.entity';
import { StepService } from './step.service';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';
import { Step } from './entities/step.entity';
import { ApiAuth } from '../swagger/security-schemas';

@ApiTags('Étapes de Parcours')
@Controller('steps')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class StepController {
  constructor(private readonly stepService: StepService) {}

  // ✅ Créer une étape dans un parcours (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Post('tour/:tourId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ajouter une étape à un parcours',
    description: 'Crée une nouvelle étape à la fin du parcours spécifié',
  })
  @ApiParam({ name: 'tourId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 201,
    description: 'Étape créée avec succès',
    schema: {
      example: {
        success: true,
        message: 'Étape ajoutée avec succès',
        step: {
          id: 'step-uuid-1',
          tourId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          orderIndex: 3,
          title: 'Bienvenue !',
          content: 'Cliquez ici pour commencer votre premier virement',
          targetSelector: '#transfer-button',
          position: 'BOTTOM',
          action: 'CLICK',
          skipAllowed: true,
          highlightElement: true,
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-15T10:30:00.000Z',
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Parcours introuvable', schema: {
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
  async create(
    @Param('tourId', ParseUUIDPipe) tourId: string,
    @Body() createStepDto: CreateStepDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const step = await this.stepService.create(
      createStepDto,
      tourId,
      organizationId,
    );
    return {
      success: true,
      message: 'Étape ajoutée avec succès',
      step,
    };
  }

  // ✅ Lister les étapes d'un parcours
  @Get('tour/:tourId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lister les étapes d\'un parcours',
    description: 'Retourne toutes les étapes triées par ordre croissant (orderIndex)',
  })
  @ApiParam({ name: 'tourId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Liste des étapes du parcours',
    schema: {
      example: {
        success: true,
        count: 2,
        steps: [
          {
            id: 'step-uuid-1',
            tourId: 'tour-uuid',
            orderIndex: 1,
            title: 'Bienvenue !',
            content: 'Cliquez ici pour commencer',
            targetSelector: '#transfer-button',
            position: 'BOTTOM',
            action: 'CLICK',
            skipAllowed: true,
            highlightElement: true,
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z',
          },
          {
            id: 'step-uuid-2',
            tourId: 'tour-uuid',
            orderIndex: 2,
            title: 'Saisissez le montant',
            content: 'Entrez le montant du virement',
            targetSelector: '#amount-input',
            position: 'RIGHT',
            action: 'NEXT',
            skipAllowed: false,
            highlightElement: true,
            createdAt: '2026-02-15T10:30:00.000Z',
            updatedAt: '2026-02-15T10:30:00.000Z',
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
  async findAllByTour(
    @Param('tourId', ParseUUIDPipe) tourId: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const steps = await this.stepService.findAllByTour(tourId, organizationId);
    return {
      success: true,
      count: steps.length,
      steps,
    };
  }

  // ✅ Détails d'une étape
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Détails d\'une étape',
    description: 'Retourne les informations détaillées d\'une étape',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({
    status: 200,
    description: 'Étape trouvée',
    schema: {
      example: {
        success: true,
        step: {
          id: 'step-uuid-1',
          tourId: 'tour-uuid',
          orderIndex: 1,
          title: 'Bienvenue !',
          content: 'Cliquez ici pour commencer votre premier virement',
          targetSelector: '#transfer-button',
          position: 'BOTTOM',
          action: 'CLICK',
          skipAllowed: true,
          highlightElement: true,
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-15T10:30:00.000Z',
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Étape introuvable', schema: {
    example: {
      message: 'Étape introuvable',
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
    const step = await this.stepService.findById(id, organizationId);
    return {
      success: true,
      step,
    };
  }

  // ✅ Mettre à jour une étape (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Modifier une étape',
    description: 'Met à jour le contenu et les paramètres d\'une étape',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({
    status: 200,
    description: 'Étape mise à jour avec succès',
    schema: {
      example: {
        success: true,
        message: 'Étape mise à jour avec succès',
        step: {
          id: 'step-uuid-1',
          tourId: 'tour-uuid',
          orderIndex: 1,
          title: 'Bienvenue (modifié) !',
          content: 'Contenu mis à jour',
          targetSelector: '#new-selector',
          position: 'TOP',
          action: 'HOVER',
          skipAllowed: false,
          highlightElement: true,
          createdAt: '2026-02-15T10:30:00.000Z',
          updatedAt: '2026-02-16T14:00:00.000Z',
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Étape introuvable', schema: {
    example: {
      message: 'Étape introuvable',
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
    @Body() updateStepDto: UpdateStepDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const step = await this.stepService.update(id, updateStepDto, organizationId);
    return {
      success: true,
      message: 'Étape mise à jour avec succès',
      step,
    };
  }

  // ✅ Supprimer une étape (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer une étape',
    description: 'Supprime une étape et réorganise automatiquement l\'ordre des étapes restantes',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({ 
    status: 200, 
    description: 'Étape supprimée avec succès',
    schema: {
      example: {
        success: true,
        message: 'Étape supprimée avec succès',
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Étape introuvable', schema: {
    example: {
      message: 'Étape introuvable',
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
    await this.stepService.delete(id, organizationId);
    return {
      success: true,
      message: 'Étape supprimée avec succès',
    };
  }

  // ✅ Réorganiser les étapes manuellement (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Put('tour/:tourId/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Réorganiser les étapes',
    description: 'Définit un nouvel ordre pour toutes les étapes d\'un parcours en fournissant la liste ordonnée des IDs',
  })
  @ApiParam({ name: 'tourId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiBody({
    description: 'Liste ordonnée des IDs des étapes dans le nouvel ordre souhaité',
    schema: {
      type: 'object',
      properties: {
        stepIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          example: ['step-uuid-3', 'step-uuid-1', 'step-uuid-2'],
          description: 'Les IDs des étapes dans l\'ordre souhaité',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Étapes réorganisées avec succès',
    schema: {
      example: {
        success: true,
        message: 'Étapes réorganisées avec succès',
        steps: [
          {
            id: 'step-uuid-3',
            tourId: 'tour-uuid',
            orderIndex: 1,
            title: 'Étape C (maintenant première)',
            content: 'Contenu de l\'étape',
            position: 'BOTTOM',
            action: 'NEXT',
            skipAllowed: true,
            highlightElement: true,
          },
          {
            id: 'step-uuid-1',
            tourId: 'tour-uuid',
            orderIndex: 2,
            title: 'Étape A (maintenant deuxième)',
            content: 'Contenu de l\'étape',
            position: 'BOTTOM',
            action: 'CLICK',
            skipAllowed: true,
            highlightElement: true,
          },
          {
            id: 'step-uuid-2',
            tourId: 'tour-uuid',
            orderIndex: 3,
            title: 'Étape B (maintenant troisième)',
            content: 'Contenu de l\'étape',
            position: 'RIGHT',
            action: 'NEXT',
            skipAllowed: false,
            highlightElement: true,
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Parcours introuvable', schema: {
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
  async reorder(
    @Param('tourId', ParseUUIDPipe) tourId: string,
    @Body('stepIds') stepIds: string[],
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const steps = await this.stepService.reorder(tourId, stepIds, organizationId);
    return {
      success: true,
      message: 'Étapes réorganisées avec succès',
      steps,
    };
  }

  // ✅ Déplacer une étape vers le haut (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Put(':id/move-up')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Déplacer l\'étape vers le haut',
    description: 'Échange la position de l\'étape avec l\'étape précédente (orderIndex - 1)',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-2' })
  @ApiResponse({
    status: 200,
    description: 'Étape déplacée vers le haut',
    schema: {
      example: {
        success: true,
        message: 'Étape déplacée vers le haut',
        steps: [
          {
            id: 'step-uuid-2',
            tourId: 'tour-uuid',
            orderIndex: 1,
            title: 'Étape B (montée)',
            content: 'Contenu',
            position: 'BOTTOM',
            action: 'CLICK',
            skipAllowed: true,
            highlightElement: true,
          },
          {
            id: 'step-uuid-1',
            tourId: 'tour-uuid',
            orderIndex: 2,
            title: 'Étape A (descendue)',
            content: 'Contenu',
            position: 'BOTTOM',
            action: 'NEXT',
            skipAllowed: true,
            highlightElement: true,
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Étape introuvable', schema: {
    example: {
      message: 'Étape introuvable',
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
  async moveUp(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const steps = await this.stepService.moveUp(id, organizationId);
    return {
      success: true,
      message: 'Étape déplacée vers le haut',
      steps,
    };
  }

  // ✅ Déplacer une étape vers le bas (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Put(':id/move-down')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Déplacer l\'étape vers le bas',
    description: 'Échange la position de l\'étape avec l\'étape suivante (orderIndex + 1)',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({
    status: 200,
    description: 'Étape déplacée vers le bas',
    schema: {
      example: {
        success: true,
        message: 'Étape déplacée vers le bas',
        steps: [
          {
            id: 'step-uuid-1',
            tourId: 'tour-uuid',
            orderIndex: 2,
            title: 'Étape A (descendue)',
            content: 'Contenu',
            position: 'BOTTOM',
            action: 'CLICK',
            skipAllowed: true,
            highlightElement: true,
          },
          {
            id: 'step-uuid-2',
            tourId: 'tour-uuid',
            orderIndex: 1,
            title: 'Étape B (montée)',
            content: 'Contenu',
            position: 'RIGHT',
            action: 'NEXT',
            skipAllowed: true,
            highlightElement: true,
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Étape introuvable', schema: {
    example: {
      message: 'Étape introuvable',
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
  async moveDown(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const steps = await this.stepService.moveDown(id, organizationId);
    return {
      success: true,
      message: 'Étape déplacée vers le bas',
      steps,
    };
  }

  // ✅ Dupliquer une étape (ADMIN uniquement)
  @Roles(UserRole.ADMIN)
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Dupliquer une étape',
    description: 'Crée une copie exacte de l\'étape juste après l\'originale avec un nouvel orderIndex',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({
    status: 201,
    description: 'Étape dupliquée avec succès',
    schema: {
      example: {
        success: true,
        message: 'Étape dupliquée avec succès',
        step: {
          id: 'step-uuid-new',
          tourId: 'tour-uuid',
          orderIndex: 2,
          title: 'Bienvenue ! (copie)',
          content: 'Cliquez ici pour commencer votre premier virement',
          targetSelector: '#transfer-button',
          position: 'BOTTOM',
          action: 'CLICK',
          skipAllowed: true,
          highlightElement: true,
          createdAt: '2026-02-15T11:00:00.000Z',
          updatedAt: '2026-02-15T11:00:00.000Z',
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Étape introuvable', schema: {
    example: {
      message: 'Étape introuvable',
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
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = user.organizationId || user.organizations?.[0]?.id;
    const step = await this.stepService.duplicate(id, organizationId);
    return {
      success: true,
      message: 'Étape dupliquée avec succès',
      step,
    };
  }
}
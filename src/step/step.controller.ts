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

@ApiTags('Steps of Guided Tour')
@Controller('steps')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class StepController {
  constructor(private readonly stepService: StepService) {}

  // ✅ Create a step in a tour (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Post('tour/:tourId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a step to a tour',
    description: 'Creates a new step at the end of the specified tour',
  })
  @ApiParam({ name: 'tourId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 201,
    description: 'Step created successfully',
    schema: {
      example: {
        success: true,
        message: 'Step added successfully',
        step: {
          id: 'step-uuid-1',
          tourId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          orderIndex: 3,
          title: 'Welcome!',
          content: 'Click here to start your first transfer',
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
  @ApiResponse({ status: 404, description: 'Tour not found', schema: {
    example: {
      message: 'Tour not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
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
      message: 'Step added successfully',
      step,
    };
  }

  // ✅ List steps of a tour
  @Get('tour/:tourId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List steps of a tour',
    description: 'Returns all steps sorted by ascending order (orderIndex)',
  })
  @ApiParam({ name: 'tourId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'List of tour steps',
    schema: {
      example: {
        success: true,
        count: 2,
        steps: [
          {
            id: 'step-uuid-1',
            tourId: 'tour-uuid',
            orderIndex: 1,
            title: 'Welcome!',
            content: 'Click here to start',
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
            title: 'Enter the amount',
            content: 'Enter the transfer amount',
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
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', schema: {
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

  // ✅ Step details
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Step details',
    description: 'Returns detailed information about a step',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({
    status: 200,
    description: 'Step found',
    schema: {
      example: {
        success: true,
        step: {
          id: 'step-uuid-1',
          tourId: 'tour-uuid',
          orderIndex: 1,
          title: 'Welcome!',
          content: 'Click here to start your first transfer',
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
  @ApiResponse({ status: 404, description: 'Step not found', schema: {
    example: {
      message: 'Step not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', schema: {
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

  // ✅ Update a step (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a step',
    description: 'Updates the content and settings of a step',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({
    status: 200,
    description: 'Step updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Step updated successfully',
        step: {
          id: 'step-uuid-1',
          tourId: 'tour-uuid',
          orderIndex: 1,
          title: 'Welcome (modified)!',
          content: 'Updated content',
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
  @ApiResponse({ status: 404, description: 'Step not found', schema: {
    example: {
      message: 'Step not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
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
      message: 'Step updated successfully',
      step,
    };
  }

  // ✅ Delete a step (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a step',
    description: 'Deletes a step and automatically reorders the remaining steps',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({ 
    status: 200, 
    description: 'Step deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Step deleted successfully',
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Step not found', schema: {
    example: {
      message: 'Step not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
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
      message: 'Step deleted successfully',
    };
  }

  // ✅ Reorder steps manually (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Put('tour/:tourId/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reorder steps',
    description: 'Defines a new order for all steps in a tour by providing an ordered list of IDs',
  })
  @ApiParam({ name: 'tourId', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiBody({
    description: 'Ordered list of step IDs in the desired new order',
    schema: {
      type: 'object',
      properties: {
        stepIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          example: ['step-uuid-3', 'step-uuid-1', 'step-uuid-2'],
          description: 'Step IDs in the desired order',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Steps reordered successfully',
    schema: {
      example: {
        success: true,
        message: 'Steps reordered successfully',
        steps: [
          {
            id: 'step-uuid-3',
            tourId: 'tour-uuid',
            orderIndex: 1,
            title: 'Step C (now first)',
            content: 'Step content',
            position: 'BOTTOM',
            action: 'NEXT',
            skipAllowed: true,
            highlightElement: true,
          },
          {
            id: 'step-uuid-1',
            tourId: 'tour-uuid',
            orderIndex: 2,
            title: 'Step A (now second)',
            content: 'Step content',
            position: 'BOTTOM',
            action: 'CLICK',
            skipAllowed: true,
            highlightElement: true,
          },
          {
            id: 'step-uuid-2',
            tourId: 'tour-uuid',
            orderIndex: 3,
            title: 'Step B (now third)',
            content: 'Step content',
            position: 'RIGHT',
            action: 'NEXT',
            skipAllowed: false,
            highlightElement: true,
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Tour not found', schema: {
    example: {
      message: 'Tour not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
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
      message: 'Steps reordered successfully',
      steps,
    };
  }

  // ✅ Move a step up (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Put(':id/move-up')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move step up',
    description: 'Swaps the position of the step with the previous step (orderIndex - 1)',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-2' })
  @ApiResponse({
    status: 200,
    description: 'Step moved up',
    schema: {
      example: {
        success: true,
        message: 'Step moved up',
        steps: [
          {
            id: 'step-uuid-2',
            tourId: 'tour-uuid',
            orderIndex: 1,
            title: 'Step B (moved up)',
            content: 'Content',
            position: 'BOTTOM',
            action: 'CLICK',
            skipAllowed: true,
            highlightElement: true,
          },
          {
            id: 'step-uuid-1',
            tourId: 'tour-uuid',
            orderIndex: 2,
            title: 'Step A (moved down)',
            content: 'Content',
            position: 'BOTTOM',
            action: 'NEXT',
            skipAllowed: true,
            highlightElement: true,
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Step not found', schema: {
    example: {
      message: 'Step not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
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
      message: 'Step moved up',
      steps,
    };
  }

  // ✅ Move a step down (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Put(':id/move-down')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move step down',
    description: 'Swaps the position of the step with the next step (orderIndex + 1)',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({
    status: 200,
    description: 'Step moved down',
    schema: {
      example: {
        success: true,
        message: 'Step moved down',
        steps: [
          {
            id: 'step-uuid-1',
            tourId: 'tour-uuid',
            orderIndex: 2,
            title: 'Step A (moved down)',
            content: 'Content',
            position: 'BOTTOM',
            action: 'CLICK',
            skipAllowed: true,
            highlightElement: true,
          },
          {
            id: 'step-uuid-2',
            tourId: 'tour-uuid',
            orderIndex: 1,
            title: 'Step B (moved up)',
            content: 'Content',
            position: 'RIGHT',
            action: 'NEXT',
            skipAllowed: true,
            highlightElement: true,
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Step not found', schema: {
    example: {
      message: 'Step not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
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
      message: 'Step moved down',
      steps,
    };
  }

  // ✅ Duplicate a step (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Duplicate a step',
    description: 'Creates an exact copy of the step right after the original with a new orderIndex',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'step-uuid-1' })
  @ApiResponse({
    status: 201,
    description: 'Step duplicated successfully',
    schema: {
      example: {
        success: true,
        message: 'Step duplicated successfully',
        step: {
          id: 'step-uuid-new',
          tourId: 'tour-uuid',
          orderIndex: 2,
          title: 'Welcome! (copy)',
          content: 'Click here to start your first transfer',
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
  @ApiResponse({ status: 404, description: 'Step not found', schema: {
    example: {
      message: 'Step not found',
      error: 'Not Found',
      statusCode: 404
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
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
      message: 'Step duplicated successfully',
      step,
    };
  }
}
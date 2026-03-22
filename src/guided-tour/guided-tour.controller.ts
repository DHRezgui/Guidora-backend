import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, UseGuards, ParseUUIDPipe, Query, BadRequestException } from '@nestjs/common';
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

  private getOrganizationId(user: any): string {
    const organizationId = user?.organizationId || user?.organizations?.[0]?.id;
    if (!organizationId) {
      throw new BadRequestException('Aucune organisation associee a cet utilisateur.');
    }
    return organizationId;
  }

  // Create a tour (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Create a new guided tour',
    description: 'Creates a complete tour with its steps for an organization'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Tour created successfully',
    schema: {
      example: {
        success: true,
        message: 'Tour created successfully',
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'First transfer',
          description: 'Step-by-step guide to make your first bank transfer',
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
              title: 'Welcome!',
              content: 'Click here to start your first transfer',
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
  @ApiResponse({ status: 403, description: 'Access denied - ADMIN role required', schema: {
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
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.create(
      createTourDto,
      organizationId,
      user.id,
    );
    return {
      success: true,
      message: 'Tour created successfully',
      tour,
    };
  }

  // List tours of an organization
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'List tours of an organization',
    description: 'Returns all tours (active/inactive) of the user\'s organization'
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status (true = active only, false = inactive only)' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of tours',
    schema: {
      example: {
        success: true,
        count: 2,
        tours: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            name: 'First transfer',
            description: 'Step-by-step guide to make your first bank transfer',
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
                title: 'Welcome!',
                content: 'Click here to start',
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
            name: 'Dashboard discovery',
            description: 'Overview of the main features',
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
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', schema: {
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
    const organizationId = this.getOrganizationId(user);
    const tours = await this.tourService.findAllByOrganization(organizationId, isActive);
    return {
      success: true,
      count: tours.length,
      tours,
    };
  }

  // Find active tours for a URL (for the SDK)
  @Get('active/url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Active tours for a URL',
    description: 'Returns active tours matching a target URL (used by the client SDK)'
  })
  @ApiQuery({ name: 'url', required: true, type: String, description: 'The page URL to search active tours for', example: '/dashboard/transfers' })
  @ApiResponse({ 
    status: 200, 
    description: 'Active tours found for this URL',
    schema: {
      example: {
        success: true,
        count: 1,
        tours: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            name: 'First transfer',
            description: 'Step-by-step guide to make your first bank transfer',
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
                title: 'Welcome!',
                content: 'Click here to start',
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
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', schema: {
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
    const organizationId = this.getOrganizationId(user);
    const tours = await this.tourService.findActiveToursForUrl(url, organizationId);
    return {
      success: true,
      count: tours.length,
      tours,
    };
  }

  // Tour details
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Tour details',
    description: 'Returns detailed information about a tour with its steps'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tour found',
    schema: {
      example: {
        success: true,
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'First transfer',
          description: 'Step-by-step guide to make your first bank transfer',
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
              title: 'Welcome!',
              content: 'Click here to start',
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
  @ApiResponse({ status: 404, description: 'Tour not found', schema: {
    example: {
      message: 'Tour not found',
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
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.findById(id, organizationId);
    return {
      success: true,
      tour,
    };
  }

  // Update a tour (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Update a tour',
    description: 'Updates the information and steps of an existing tour'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tour updated',
    schema: {
      example: {
        success: true,
        message: 'Tour updated successfully',
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'First transfer (modified)',
          description: 'Updated description',
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
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTourDto: UpdateGuidedTourDto,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.update(id, updateTourDto, organizationId);
    return {
      success: true,
      message: 'Tour updated successfully',
      tour,
    };
  }

  // Activate/deactivate a tour (ADMIN only)
  @Roles(UserRole.ADMIN)
  @Put(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Activate/deactivate a tour',
    description: 'Changes the active/inactive status of a tour without deleting it'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tour status updated',
    schema: {
      example: {
        success: true,
        message: 'Tour activated',
        tour: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'First transfer',
          description: 'Step-by-step guide to make your first bank transfer',
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
  async toggleActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    const tour = await this.tourService.toggleActive(id, organizationId, isActive);
    return {
      success: true,
      message: isActive ? 'Tour activated' : 'Tour deactivated',
      tour,
    };
  }

  // Delete a tour (hard delete - ADMIN only)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Delete a tour',
    description: 'Permanently deletes a tour and its steps'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tour deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Tour deleted successfully',
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
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const organizationId = this.getOrganizationId(user);
    await this.tourService.delete(id, organizationId);
    return {
      success: true,
      message: 'Tour deleted successfully',
    };
  }

}
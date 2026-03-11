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

  // Create an organization
  @Roles(UserRole.ADMIN)
  @ApiAuth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Create an organization',
    description: 'Creates a new client organization with its API key'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Organization created',
    schema: {
      example: {
        success: true,
        message: 'Organization created successfully',
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
  @ApiResponse({ status: 409, description: 'API key already in use', example: {
    statusCode: 409,
    message: 'This API key is already in use'
  }})
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', example: {
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

  // Retrieve all organizations
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'List organizations',
    description: 'Returns all organizations (ADMIN: all / DEVELOPER: read-only)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'List of organizations',
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
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', example: {
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

  // Retrieve an organization by ID
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Organization details',
    description: 'Returns detailed information about an organization'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ 
    status: 200, 
    description: 'Organization found',
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
  @ApiResponse({ status: 404, description: 'Organization not found', example: {
    message: 'Organization not found',
    error: 'Not Found',
    statusCode: 404,
  }})
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', example: {
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

  // Retrieve an organization with its users
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get(':id/users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Organization users',
    description: 'Returns users associated with an organization (without passwords)'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ 
    status: 200, 
    description: 'Users found',
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
  
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'Organization not found', example: {
    message: 'Organization not found',
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

  // Count users in an organization
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiAuth()
  @Get(':id/users/count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'User count',
    description: 'Returns the number of active users in an organization'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ 
    status: 200, 
    description: 'Count completed',
    schema: {
      example: {
        success: true,
        count: 3
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'Organization not found', example: {
    message: 'Organization not found',
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

  // Update an organization
  @Roles(UserRole.ADMIN)
  @ApiAuth()
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Update an organization',
    description: 'Updates organization information (ADMIN only)'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ status: 200, description: 'Organization updated', schema: {
    example: {
      success: true,
      message: 'Organization updated successfully',
      organization: {
        id: 'org-uuid',
        name: 'Acme Corp',
        domain: 'acme.com',
        createdAt: '2026-02-15T10:30:00.000Z',
        updatedAt: '2026-02-15T10:30:00.000Z',
      }
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'Organization not found', example: {
    message: 'Organization not found',
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

  // Delete an organization
  @Roles(UserRole.ADMIN)
  @ApiAuth()
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Delete an organization',
    description: 'Permanently deletes an organization and unassigns its users'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'org-uuid-here' })
  @ApiResponse({ status: 200, description: 'Organization deleted successfully', schema: {
    example: {
      success: true,
      message: 'Organization deleted successfully',
    }
  }})
  @ApiResponse({ status: 404, description: 'Organization not found', example: {
    message: 'Organization not found',
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
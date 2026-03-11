import { 
  Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe, HttpException,} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from './entities/user.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { ApiAuth } from '../swagger/security-schemas';

@Controller('user')  
export class UserController {
  constructor(
    private readonly userService: UserService,
  ) {}


  @Roles(UserRole.ADMIN)
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiAuth()
  @ApiOperation({ 
    summary: 'List all users',
    description: 'Returns all active users for ADMIN role'
  })
    @ApiResponse({  
    status: 200, 
    description: 'List of users',
    schema: {
      example: {
        success: true,
        count: 2,
        users: [
          {
            id: 'uuid-here',
            email: 'admin@trustdev.com',
            firstName: 'Admin',
            lastName: 'System',
            role: 'ADMIN',
            organizationId: 'org-uuid',
            isActive: true,
            emailVerified: true,
            lastLoginAt: '2026-02-15T10:30:00.000Z',
            createdAt: '2026-02-15T10:30:00.000Z'
          },
          {
            id: 'uuid-here',
            email: 'user@trustdev.com',
            firstName: 'User',
            lastName: 'Test',
            role: 'USER',
            organizationId: 'org-uuid',
            isActive: true,
            emailVerified: false,
            lastLoginAt: null,
            createdAt: '2026-02-15T11:30:00.000Z'
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
    const users = await this.userService.findAll();
    return {
      success: true,
      count: users.length,
      users,
    };
  }


  // Users by role
  @Roles(UserRole.ADMIN)
  @Get('role/:role')
  @HttpCode(HttpStatus.OK)
  @ApiAuth()
  @ApiOperation({ 
    summary: 'Users by role',
    description: 'Returns users filtered by role (ADMIN, DEVELOPER, USER)'
  })
    @ApiResponse({
    status: 200,
    description: 'Users filtered by role',
    schema: {
      example: {
        success: true,
        count: 1,
        users: [
          {
            id: 'uuid-here',
            email: 'admin@trustdev.com',
            firstName: 'Admin',
            lastName: 'System',
            role: 'ADMIN',
            organizationId: 'org-uuid',
            isActive: true,
            emailVerified: true,
            lastLoginAt: '2026-02-15T10:30:00.000Z',
            createdAt: '2026-02-15T10:30:00.000Z'
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
  @ApiResponse({ status: 500, description: 'Invalid role', example: {
    statusCode: 500,
    message: 'Invalid user role',
    error: 'Internal Server Error'
  }})      
  async findByRole(@Param('role') role: UserRole) {
    const users = await this.userService.findByRole(role);
    return {
      success: true,
      count: users.length,
      users,
    };
  }

  // Active users
  @Roles(UserRole.ADMIN)
  @Get('active')
  @HttpCode(HttpStatus.OK)
  @ApiAuth()
  @ApiOperation({ 
    summary: 'Active users',
    description: 'Returns all active users'
  })
  @ApiResponse({  
    status: 200, 
    description: 'List of active users',
    schema: {
      example: {
        success: true,
        count: 2,
        users: [
          {
            id: 'uuid-here',
            email: 'admin@trustdev.com',
            firstName: 'Admin',
            lastName: 'System',
            role: 'ADMIN',
            organizationId: 'org-uuid',
            isActive: true,
            emailVerified: true,
            lastLoginAt: '2026-02-15T10:30:00.000Z',
            createdAt: '2026-02-15T10:30:00.000Z'
          },
          {
            id: 'uuid-here',
            email: 'user@trustdev.com',
            firstName: 'User',
            lastName: 'Test',
            role: 'USER',
            organizationId: 'org-uuid',
            isActive: true,
            emailVerified: false,
            lastLoginAt: null,
            createdAt: '2026-02-15T11:30:00.000Z'
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
  async findActiveUsers() {
    const users = await this.userService.findActiveUsers();
    return {
      success: true,
      count: users.length,
      users,
    };
  }

  @ApiAuth()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'User details',
    description: 'Returns the information of a specific user'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ 
    status: 200, 
    description: 'User found',
    schema: {
      example: {
        success: true,
        user: {
          id: 'uuid-here',
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'USER',
          organizationId: 'org-uuid',
          isActive: true,
          emailVerified: false,
          lastLoginAt: '2026-02-15T10:30:00.000Z',
          createdAt: '2026-02-15T10:30:00.000Z',
        }
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'User not found', example: {
    message: 'User not found',
    error: 'Not Found',
    statusCode: 404,
  }})
  async findById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() currentUser: any,
  ) {
    // Allow ADMIN and DEVELOPER to view any user, or any user to view their own profile
    if (currentUser.role !== UserRole.ADMIN && 
        currentUser.role !== UserRole.DEVELOPER && 
        currentUser.id !== id) {
      throw new HttpException(
        'Forbidden',
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.userService.findById(id);
    return {
      success: true,
      user,
    };
  }

  @ApiAuth()
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Update a user',
    description: 'Updates user information (ADMIN: any user / USER: own profile only)'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'User updated' , schema: {
    example: {
      success: true,
      message: 'User updated successfully',
      user: {
        id: 'uuid-here',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        organizationId: 'org-uuid',
        isActive: true,
        emailVerified: false,
        lastLoginAt: null,
        createdAt: '2026-02-15T10:30:00.000Z',
        updatedAt: '2026-02-15T12:00:00.000Z',
      }
    }
  }})
  @ApiResponse({ status: 403, description: 'Unauthorized modification attempt', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'User not found', example: {
    message: 'User not found',
    error: 'Not Found',
    statusCode: 404,
  }})
  async update(
    @Param('id', new ParseUUIDPipe()) id: string, 
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: any,
  ) {
    // Vérifier que l'utilisateur modifie son propre profil OU est ADMIN
    if (currentUser.id !== id && currentUser.role !== UserRole.ADMIN) {
      throw new HttpException(
        'Vous ne pouvez modifier que votre propre profil',
        HttpStatus.FORBIDDEN,
      );
    }

    // Empêcher un utilisateur non-ADMIN de changer son propre rôle
    if (currentUser.role !== UserRole.ADMIN && updateUserDto.role) {
      throw new HttpException(
        'Vous ne pouvez pas modifier votre propre rôle',
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.userService.update(id, updateUserDto);
    return {
      success: true,
      message: 'Utilisateur mis à jour avec succès',
      user,
    };
  }



  
  @ApiAuth()
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Delete a user',
    description: 'Deletes a user (ADMIN only)'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'User deleted' , schema: {
    example: {
      success: true,
      message: 'User deleted successfully',
    }
  }})
  @ApiResponse({ status: 403, description: 'Unauthorized modification attempt', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'User not found', example: {
    message: 'User not found',
    error: 'Not Found',
    statusCode: 404,
  }})
  async delete(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.userService.delete(id);
    return {
      success: true,
      message: 'Utilisateur supprimé avec succès',
    };
  }

  // Assign to an organization
  
  @ApiAuth()
  @Roles(UserRole.ADMIN)
  @Post(':id/assign-organization')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Assign a user to an organization',
    description: 'Assigns a user to a specific organization (ADMIN only)'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiBody({
    description: 'Name of the organization to assign the user to',
    schema: {
      type: 'object',
      required: ['organizationName'],
      properties: {
        organizationName: {
          type: 'string',
          example: 'Acme Corporation',
          description: 'The exact name of the organization',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'User assigned to organization', schema: {
    example: {
      success: true,
      message: 'User assigned to organization successfully',
      user: {
        id: 'uuid-here',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        organizationId: 'org-uuid',
        isActive: true,
        emailVerified: false,
        lastLoginAt: null,
        createdAt: '2026-02-15T10:30:00.000Z',
        updatedAt: '2026-02-15T12:00:00.000Z',
      }
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'User not found', example: {
    message: 'User not found',
    error: 'Not Found',
    statusCode: 404,
  }})
  async assignToOrganization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('organizationName') organizationName: string,
  ) {
    const user = await this.userService.assignToOrganization(id, organizationName);
    return {
      success: true,
      message: 'Utilisateur assigné à l\'organisation avec succès',
      user,
    };
  }

  // Remove from an organization
  @ApiAuth()
  @Roles(UserRole.ADMIN)
  @Post(':id/remove-organization')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Remove a user from an organization',
    description: 'Removes a user from their current organization (ADMIN only)'
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'User removed from organization', schema: {
    example: {
      success: true,
      message: 'User removed from organization successfully',
      user: {
        id: 'uuid-here',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        organizationId: null,
        isActive: true,
        emailVerified: false,
        lastLoginAt: null,
        createdAt: '2026-02-15T10:30:00.000Z',
        updatedAt: '2026-02-15T12:00:00.000Z',
      }
    }
  }})
  @ApiResponse({ status: 403, description: 'Access denied - You do not have the required permissions', example: {
    message: 'Forbidden resource',
    error: 'Forbidden',
    statusCode: 403
  }})
  @ApiResponse({ status: 404, description: 'User not found', example: {
    message: 'User not found',
    error: 'Not Found',
    statusCode: 404,
  }})
  async removeFromOrganization(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.userService.removeFromOrganization(id);
    return {
      success: true,
      message: 'Utilisateur retiré de l\'organisation avec succès',
      user,
    };
  }

}
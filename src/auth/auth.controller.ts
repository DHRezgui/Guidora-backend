import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';

import { LoginUserDto } from '../user/dto/login-user.dto';
import { CreateUserDto } from '../user/dto/create-user.dto';

import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiAuth } from '../swagger/security-schemas';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Inscription',
    description: 'Crée un compte utilisateur et retourne les informations de base'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Inscription réussie',
    schema: {
      example: {
        success: true,
        message: 'Inscription réussie',
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx',
        token_type: "Bearer",
        expires_in: 3600,
        user: {
          id: 'uuid-here',
          email: 'dhia@trustdev.com',
          firstName: 'Dhia',
          lastName: 'Rezgui',
          role: 'USER',
          organizationId: null,
        },
      }
    }
  })
  @ApiResponse({ status: 409, description: 'Cet email est déjà utilisé' })
  @ApiResponse({ status: 400, description: 'Bad Request: Le rôle doit être ADMIN, DEVELOPER ou USER' })
  async register(@Body() createUserDto: CreateUserDto) {
    const result = await this.authService.register(createUserDto);
    return {
      success: true,
      message: 'Inscription réussie',
      ...result,
    };
  }

  
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Connexion',
    description: 'Authentifie un utilisateur et retourne un token JWT'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Connexion réussie',
    schema: {
      example: {
        success: true,
        message: 'Connexion réussie',
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx',
        token_type: "Bearer",
        expires_in: 3600,
        user: {
          id: 'uuid-here',
          email: 'dhia@trustdev.com',
          firstName: 'Dhia',
          lastName: 'Rezgui',
          role: 'USER',
          organizationId: null,
        },
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Email ou mot de passe incorrect' })
  async login(@Body() loginUserDto: LoginUserDto) {
    const result = await this.authService.login(loginUserDto);
    return {
      success: true,
      message: 'Connexion réussie',
      ...result,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Profil utilisateur',
    description: 'Retourne les informations de l\'utilisateur connecté'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Profil récupéré',
    schema: {
      example: {
        success: true,
        user: {
          id: 'uuid-here',
          email: 'dhia@trustdev.com',
          role: 'USER',
          organizationId: 'org-uuid',
        }
      }
    }
  })
  async getProfile(@CurrentUser() user: any) {
    return {
      success: true,
      user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Rafraîchissement du token',
    description: 'Génère un nouveau token JWT valide pour 1h supplémentaire'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token rafraîchi',
    schema: {
      example: {
        success: true,
        message: 'Token renouvelé',
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.newtoken',
        token_type: "Bearer",
        expires_in: 3600,
        user: {
          id: 'uuid-here',
          email: 'dhia@trustdev.com',
          firstName: 'Dhia',
          lastName: 'Rezgui',
          role: 'USER',
          organizationId: 'org-uuid',
        }
      }
    }
  })
  async refresh(@CurrentUser() user: any) {
    const result = await this.authService.refreshToken(user.id);
    return {
      success: true,
      message: 'Token renouvelé',
      ...result,
    };
  }
}
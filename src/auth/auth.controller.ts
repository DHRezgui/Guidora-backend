import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Param,
  ParseUUIDPipe,
  HttpException,
  Query,
} from '@nestjs/common';
import { UserRole } from '../user/entities/user.entity';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';

import { LoginUserDto } from '../user/dto/login-user.dto';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiAuth } from '../swagger/security-schemas';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Register',
    description: 'Creates a user account and returns basic information'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Registration successful',
    schema: {
      example: {
        success: true,
        message: 'Registration successful',
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
  @ApiResponse({ status: 409, description: 'This email is already in use' })
  @ApiResponse({ status: 400, description: 'Bad Request: Role must be ADMIN, DEVELOPER or USER' })
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
    summary: 'Login',
    description: 'Authenticates a user and returns a JWT token'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Login successful',
    schema: {
      example: {
        success: true,
        message: 'Login successful',
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
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
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
    summary: 'User profile',
    description: 'Returns the information of the currently authenticated user'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Profile retrieved',
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
    const fullUser = await this.userService.findById(user.id);
    return {
      success: true,
      user: fullUser,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Token refresh',
    description: 'Generates a new JWT token valid for an additional hour'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token refreshed',
    schema: {
      example: {
        success: true,
        message: 'Token renewed',
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

  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Logout',
    description: 'Logs out the currently authenticated user'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Logout successful',
    schema: {
      example: {
        success: true,
        message: 'Logout successful',
        user: {
          id: 'uuid-here',
          email: 'dhia@trustdev.com',
          firstName: 'Dhia',
          lastName: 'Rezgui',
          role: 'USER',
          organizationId: 'org-uuid',
          isActive: false,
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async logout(@CurrentUser() currentUser: any) {
    const user = await this.authService.logout(currentUser.id);
    return {
      success: true,
      message: 'Déconnexion réussie',
      user,
    };
  }

  // ===== FORGOT PASSWORD =====

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Forgot password',
    description: 'Sends a password reset email to the user',
  })
  @ApiResponse({ status: 200, description: 'Reset email sent (always returns success)' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.authService.forgotPassword(forgotPasswordDto.email);
    return {
      success: true,
      message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password',
    description: 'Resets the user password using a valid reset token',
  })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    await this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.password);
    return {
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
    };
  }

  // ===== EMAIL VERIFICATION =====

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email',
    description: 'Verifies the user email address using a verification token',
  })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid verification token' })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    await this.authService.verifyEmail(verifyEmailDto.token);
    return {
      success: true,
      message: 'Email vérifié avec succès',
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend verification email',
    description: 'Resends the email verification link to the current user',
  })
  @ApiResponse({ status: 200, description: 'Verification email sent' })
  @ApiResponse({ status: 400, description: 'Email already verified' })
  async resendVerification(@CurrentUser() user: any) {
    await this.authService.resendVerificationEmail(user.id);
    return {
      success: true,
      message: 'Email de vérification renvoyé',
    };
  }
}
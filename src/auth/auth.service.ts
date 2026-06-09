
import { Injectable, UnauthorizedException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { MailService } from '../mail/mail.service';

import { LoginUserDto } from '../user/dto/login-user.dto';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UserRole } from '../user/entities/user.entity';

import { JwtPayload, JwtResponse } from './types/jwt-payload.type';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  
  async register(createUserDto: CreateUserDto): Promise<JwtResponse> {
    const user = await this.userService.create({
      ...createUserDto,
      role: UserRole.USER,
    });

    // Generate email verification token and send email
    try {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      await this.userService.setEmailVerificationToken(user.id, verificationToken);
      await this.mailService.sendEmailVerification(user.email, verificationToken, user.firstName);
    } catch (error) {
      this.logger.warn(`Failed to send verification email to ${user.email}: ${error.message}`);
    }

    return this.generateToken(user);
  }

  
  async login(loginUserDto: LoginUserDto): Promise<JwtResponse> {
    const user = await this.userService.findByEmail(loginUserDto.email);

    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const isPasswordValid = await user.validatePassword(loginUserDto.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    user.lastLoginAt = new Date();
    user.isActive = true;
    await this.userService.update(user.id, { lastLoginAt : user.lastLoginAt, isActive: user.isActive });
  

    const userResponse = await this.userService.findById(user.id);
    return this.generateToken(userResponse);
  }

  private generateToken(user: any): JwtResponse {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }

  async refreshToken(userId: string): Promise<JwtResponse> {
    const user = await this.userService.findById(userId);
    return this.generateToken(user);
  }

  async logout(userId: string) {
    return this.userService.logout(userId);
  }

  // FORGOT PASSWORD 

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userService.findByEmail(email);

    // Always return success to avoid email enumeration
    if (!user) {
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await this.userService.setResetPasswordToken(user.id, resetToken, resetExpires);
    try {
      await this.mailService.sendPasswordResetEmail(user.email, resetToken, user.firstName);
    } catch (error) {
      this.logger.warn(`Failed to send password reset email to ${user.email}: ${error.message}`);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userService.findByResetToken(token);

    if (!user) {
      throw new HttpException('Token invalide ou expiré', HttpStatus.BAD_REQUEST);
    }

    if (user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
      throw new HttpException('Token expiré, veuillez refaire une demande', HttpStatus.BAD_REQUEST);
    }

    await this.userService.resetPassword(user.id, newPassword);
  }

  //  EMAIL VERIFICATION 

  async verifyEmail(token: string): Promise<void> {
    const user = await this.userService.findByEmailVerificationToken(token);

    if (!user) {
      throw new HttpException('Token de vérification invalide', HttpStatus.BAD_REQUEST);
    }

    await this.userService.verifyEmail(user.id);
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await this.userService.findByEmail(
      (await this.userService.findById(userId)).email,
    );

    if (!user) {
      throw new HttpException('Utilisateur introuvable', HttpStatus.NOT_FOUND);
    }

    if (user.emailVerified) {
      throw new HttpException('Email déjà vérifié', HttpStatus.BAD_REQUEST);
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await this.userService.setEmailVerificationToken(user.id, verificationToken);
    try {
      await this.mailService.sendEmailVerification(user.email, verificationToken, user.firstName);
    } catch (error) {
      this.logger.warn(`Failed to send verification email to ${user.email}: ${error.message}`);
    }
  }
}
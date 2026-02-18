
import { Injectable, UnauthorizedException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';

import { LoginUserDto } from '../user/dto/login-user.dto';
import { CreateUserDto } from '../user/dto/create-user.dto';

import { JwtPayload, JwtResponse } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  
  async register(createUserDto: CreateUserDto): Promise<JwtResponse> {
    const user = await this.userService.create(createUserDto);
    return this.generateToken(user);
  }

  
  async login(loginUserDto: LoginUserDto): Promise<JwtResponse> {
    const user = await this.userService.findByEmail(loginUserDto.email);

    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    const isPasswordValid = await user.validatePassword(loginUserDto.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    user.lastLoginAt = new Date();
    await this.userService.update(user.id, { lastLoginAt : user.lastLoginAt });
  

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
}
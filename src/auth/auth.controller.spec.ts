
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { LoginUserDto } from '../user/dto/login-user.dto';
import { UserRole } from '../user/entities/user.entity';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
  };

  const mockJwtResponse = {
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.token',
    token_type: 'Bearer',
    expires_in: 3600,
    user: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'admin@trustdev.com',
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      organizationId: null,
    },
  };

  const mockCurrentUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'admin@trustdev.com',
    role: UserRole.ADMIN,
    organizationId: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  
  describe('register', () => {
    it('should register a new user and return JWT token', async () => {
      const createUserDto: CreateUserDto = {
        email: 'admin@trustdev.com',
        password: 'Admin123!',
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
      };

      mockAuthService.register.mockResolvedValue(mockJwtResponse);

      const result = await controller.register(createUserDto);

      expect(result).toEqual({
        success: true,
        message: 'Inscription réussie',
        ...mockJwtResponse,
      });
      expect(service.register).toHaveBeenCalledWith(createUserDto);
      expect(service.register).toHaveBeenCalledTimes(1);
    });

    it('should return access_token in response', async () => {
      const createUserDto: CreateUserDto = {
        email: 'user@trustdev.com',
        password: 'User123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockAuthService.register.mockResolvedValue(mockJwtResponse);

      const result = await controller.register(createUserDto);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect(result).toHaveProperty('expires_in', 3600);
      expect(result).toHaveProperty('user');
    });

    it('should throw error if email already exists', async () => {
      const createUserDto: CreateUserDto = {
        email: 'existing@trustdev.com',
        password: 'Admin123!',
        firstName: 'Admin',
        lastName: 'User',
      };

      mockAuthService.register.mockRejectedValue(
        new Error('Cet email est déjà utilisé'),
      );

      await expect(controller.register(createUserDto)).rejects.toThrow(
        'Cet email est déjà utilisé',
      );
    });
  });

  
  describe('login', () => {
    it('should login user and return JWT token', async () => {
      const loginUserDto: LoginUserDto = {
        email: 'admin@trustdev.com',
        password: 'Admin123!',
      };

      mockAuthService.login.mockResolvedValue(mockJwtResponse);

      const result = await controller.login(loginUserDto);

      expect(result).toEqual({
        success: true,
        message: 'Connexion réussie',
        ...mockJwtResponse,
      });
      expect(service.login).toHaveBeenCalledWith(loginUserDto);
      expect(service.login).toHaveBeenCalledTimes(1);
    });

    it('should return valid token structure with 1 hour expiry', async () => {
      const loginUserDto: LoginUserDto = {
        email: 'admin@trustdev.com',
        password: 'Admin123!',
      };

      mockAuthService.login.mockResolvedValue(mockJwtResponse);

      const result = await controller.login(loginUserDto);

      expect(result.access_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(3600); // ✅ 1 heure
    });

    it('should throw UnauthorizedException with wrong password', async () => {
      const loginUserDto: LoginUserDto = {
        email: 'admin@trustdev.com',
        password: 'WrongPassword!',
      };

      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Email ou mot de passe incorrect'),
      );

      await expect(controller.login(loginUserDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException with non-existent email', async () => {
      const loginUserDto: LoginUserDto = {
        email: 'notfound@trustdev.com',
        password: 'Admin123!',
      };

      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Email ou mot de passe incorrect'),
      );

      await expect(controller.login(loginUserDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  
  describe('getProfile', () => {
    it('should return current user profile', async () => {
      const result = await controller.getProfile(mockCurrentUser);

      expect(result).toEqual({
        success: true,
        user: mockCurrentUser,
      });
    });

    it('should return user without password', async () => {
      const result = await controller.getProfile(mockCurrentUser);

      expect(result.user).not.toHaveProperty('password');
    });

    it('should return profile for different roles', async () => {
      const devUser = { ...mockCurrentUser, role: UserRole.DEVELOPER };

      const result = await controller.getProfile(devUser);

      expect(result.user.role).toBe(UserRole.DEVELOPER);
    });
  });

  
  describe('refresh', () => {
    it('should refresh token for current user', async () => {
      const newJwtResponse = {
        ...mockJwtResponse,
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new.token',
      };

      mockAuthService.refreshToken.mockResolvedValue(newJwtResponse);

      const result = await controller.refresh(mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Token renouvelé',
        ...newJwtResponse,
      });
      expect(service.refreshToken).toHaveBeenCalledWith(mockCurrentUser.id);
    });

    it('should return new access_token with 1 hour expiry', async () => {
      const newJwtResponse = {
        ...mockJwtResponse,
        access_token: 'new.fresh.token',
      };

      mockAuthService.refreshToken.mockResolvedValue(newJwtResponse);

      const result = await controller.refresh(mockCurrentUser);

      expect(result.access_token).toBe('new.fresh.token');
      expect(result.expires_in).toBe(3600);
    });

    it('should throw error if user not found during refresh', async () => {
      mockAuthService.refreshToken.mockRejectedValue(
        new UnauthorizedException('Utilisateur introuvable'),
      );

      await expect(controller.refresh(mockCurrentUser)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  
  describe('logout', () => {
    it('should logout the current user', async () => {
      const loggedOutUser = {
        ...mockJwtResponse.user,
        isActive: false,
      };

      mockAuthService.logout.mockResolvedValue(loggedOutUser);

      const result = await controller.logout(mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Déconnexion réussie',
        user: loggedOutUser,
      });
      expect(service.logout).toHaveBeenCalledWith(mockCurrentUser.id);
    });

    it('should throw error if user not found', async () => {
      mockAuthService.logout.mockRejectedValue(
        new Error('Utilisateur introuvable'),
      );

      await expect(controller.logout(mockCurrentUser)).rejects.toThrow(
        'Utilisateur introuvable',
      );
    });
  });
});
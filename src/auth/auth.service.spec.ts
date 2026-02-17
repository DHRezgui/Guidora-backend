
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { UserRole } from '../user/entities/user.entity';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { LoginUserDto } from '../user/dto/login-user.dto';

describe('AuthService', () => {
  let service: AuthService;
  let userService: UserService;
  let jwtService: JwtService;

  const mockUserService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockUserResponse = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'admin@trustdev.com',
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
    organizationId: null,
    isActive: true,
    emailVerified: false,
    lastLoginAt: null,
    createdAt: new Date('2026-02-04T10:00:00.000Z'),
    updatedAt: new Date('2026-02-04T10:00:00.000Z'),
  };

  const mockUserWithPassword = {
    ...mockUserResponse,
    password: '$2b$10$hashedpassword',
    validatePassword: jest.fn(),
  };

  const mockAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.token';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  
  describe('register', () => {
    it('should register user and return JWT response', async () => {
      const createUserDto: CreateUserDto = {
        email: 'admin@trustdev.com',
        password: 'Admin123!',
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
      };

      mockUserService.create.mockResolvedValue(mockUserResponse);
      mockJwtService.sign.mockReturnValue(mockAccessToken);

      const result = await service.register(createUserDto);

      expect(result).toEqual({
        access_token: mockAccessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          id: mockUserResponse.id,
          email: mockUserResponse.email,
          firstName: mockUserResponse.firstName,
          lastName: mockUserResponse.lastName,
          role: mockUserResponse.role,
          organizationId: mockUserResponse.organizationId,
        },
      });
      expect(userService.create).toHaveBeenCalledWith(createUserDto);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUserResponse.id,
        email: mockUserResponse.email,
        role: mockUserResponse.role,
        organizationId: mockUserResponse.organizationId,
      });
    });

    it('should throw error if email already exists', async () => {
      const createUserDto: CreateUserDto = {
        email: 'existing@trustdev.com',
        password: 'Admin123!',
        firstName: 'Admin',
        lastName: 'User',
      };

      mockUserService.create.mockRejectedValue(
        new HttpException('Cet email est déjà utilisé', HttpStatus.CONFLICT),
      );

      await expect(service.register(createUserDto)).rejects.toThrow(
        new HttpException('Cet email est déjà utilisé', HttpStatus.CONFLICT),
      );
    });
  });

  
  describe('login', () => {
    it('should login user and return JWT response', async () => {
      const loginUserDto: LoginUserDto = {
        email: 'admin@trustdev.com',
        password: 'Admin123!',
      };

      const userWithValidPassword = {
        ...mockUserWithPassword,
        validatePassword: jest.fn().mockResolvedValue(true),
      };

      mockUserService.findByEmail.mockResolvedValue(userWithValidPassword);
      mockUserService.update.mockResolvedValue(mockUserResponse);
      mockUserService.findById.mockResolvedValue(mockUserResponse);
      mockJwtService.sign.mockReturnValue(mockAccessToken);

      const result = await service.login(loginUserDto);

      expect(result).toEqual({
        access_token: mockAccessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          id: mockUserResponse.id,
          email: mockUserResponse.email,
          firstName: mockUserResponse.firstName,
          lastName: mockUserResponse.lastName,
          role: mockUserResponse.role,
          organizationId: mockUserResponse.organizationId,
        },
      });
      expect(userService.findByEmail).toHaveBeenCalledWith(loginUserDto.email);
      expect(userWithValidPassword.validatePassword).toHaveBeenCalledWith(
        loginUserDto.password,
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const loginUserDto: LoginUserDto = {
        email: 'notfound@trustdev.com',
        password: 'Admin123!',
      };

      mockUserService.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginUserDto)).rejects.toThrow(
        new UnauthorizedException('Email ou mot de passe incorrect'),
      );
    });

    it('should throw UnauthorizedException if password invalid', async () => {
      const loginUserDto: LoginUserDto = {
        email: 'admin@trustdev.com',
        password: 'WrongPassword!',
      };

      const userWithInvalidPassword = {
        ...mockUserWithPassword,
        validatePassword: jest.fn().mockResolvedValue(false),
      };

      mockUserService.findByEmail.mockResolvedValue(userWithInvalidPassword);

      await expect(service.login(loginUserDto)).rejects.toThrow(
        new UnauthorizedException('Email ou mot de passe incorrect'),
      );
    });


    it('should update lastLoginAt on successful login', async () => {
      const loginUserDto: LoginUserDto = {
        email: 'admin@trustdev.com',
        password: 'Admin123!',
      };

      const userWithValidPassword = {
        ...mockUserWithPassword,
        validatePassword: jest.fn().mockResolvedValue(true),
      };

      mockUserService.findByEmail.mockResolvedValue(userWithValidPassword);
      mockUserService.update.mockResolvedValue(mockUserResponse);
      mockUserService.findById.mockResolvedValue(mockUserResponse);
      mockJwtService.sign.mockReturnValue(mockAccessToken);

      await service.login(loginUserDto);

      expect(userService.update).toHaveBeenCalledWith(
        userWithValidPassword.id,
        expect.objectContaining({
        isActive: true,
        lastLoginAt: expect.any(Date),
      }),
    );
    });

    it('should not expose password in response', async () => {
      const loginUserDto: LoginUserDto = {
        email: 'admin@trustdev.com',
        password: 'Admin123!',
      };

      const userWithValidPassword = {
        ...mockUserWithPassword,
        validatePassword: jest.fn().mockResolvedValue(true),
      };

      mockUserService.findByEmail.mockResolvedValue(userWithValidPassword);
      mockUserService.update.mockResolvedValue(mockUserResponse);
      mockUserService.findById.mockResolvedValue(mockUserResponse);
      mockJwtService.sign.mockReturnValue(mockAccessToken);

      const result = await service.login(loginUserDto);

      expect(result.user).not.toHaveProperty('password');
    });
  });


  describe('refreshToken', () => {
    it('should generate new token for existing user', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';

      mockUserService.findById.mockResolvedValue(mockUserResponse);
      mockJwtService.sign.mockReturnValue(mockAccessToken);

      const result = await service.refreshToken(userId);

      expect(result).toEqual({
        access_token: mockAccessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          id: mockUserResponse.id,
          email: mockUserResponse.email,
          firstName: mockUserResponse.firstName,
          lastName: mockUserResponse.lastName,
          role: mockUserResponse.role,
          organizationId: mockUserResponse.organizationId,
        },
      });
      expect(userService.findById).toHaveBeenCalledWith(userId);
    });

    it('should return token valid for 1 hour', async () => {
      mockUserService.findById.mockResolvedValue(mockUserResponse);
      mockJwtService.sign.mockReturnValue(mockAccessToken);

      const result = await service.refreshToken(mockUserResponse.id);

      // ✅ Vérification critique : 1 heure = 3600 secondes
      expect(result.expires_in).toBe(3600);
    });

    it('should throw error if user not found', async () => {
      mockUserService.findById.mockRejectedValue(
        new UnauthorizedException('Utilisateur introuvable'),
      );

      await expect(
        service.refreshToken('invalid-id'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─────────────────────────────────────────────
  describe('generateToken payload', () => {
    it('should include correct JWT payload fields', async () => {
      const createUserDto: CreateUserDto = {
        email: 'admin@trustdev.com',
        password: 'Admin123!',
        firstName: 'Admin',
        lastName: 'User',
      };

      mockUserService.create.mockResolvedValue(mockUserResponse);
      mockJwtService.sign.mockReturnValue(mockAccessToken);

      await service.register(createUserDto);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUserResponse.id,
        email: mockUserResponse.email,
        role: mockUserResponse.role,
        organizationId: mockUserResponse.organizationId,
      });
    });
  });
});
// user.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { OrganizationService } from '../organization/organization.service';
import { NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

describe('UserService', () => {
  let service: UserService;
  let userRepository: Repository<User>;
  let organizationService: OrganizationService;

  // Mock du Repository
  const mockUserRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
  };

  // Mock du OrganizationService
  const mockOrganizationService = {
    findAll: jest.fn(),
    hasReachedUserLimit: jest.fn(),
  };

  // Données de test
  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    password: '$2b$10$hashedpassword',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.USER,
    organizationId: null,
    isActive: true,
    emailVerified: false,
    lastLoginAt: null,
    createdAt: new Date('2026-02-04T10:00:00.000Z'),
    updatedAt: new Date('2026-02-04T10:00:00.000Z'),
    validatePassword: jest.fn(),
    hashPassword: jest.fn(),
    organization: null,
  } as any;

  const mockUserResponse = {
    id: mockUser.id,
    email: mockUser.email,
    firstName: mockUser.firstName,
    lastName: mockUser.lastName,
    role: mockUser.role,
    organizationId: mockUser.organizationId,
    isActive: mockUser.isActive,
    emailVerified: mockUser.emailVerified,
    lastLoginAt: mockUser.lastLoginAt,
    createdAt: mockUser.createdAt,
    updatedAt: mockUser.updatedAt,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: OrganizationService,
          useValue: mockOrganizationService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    organizationService = module.get<OrganizationService>(OrganizationService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user successfully', async () => {
      const createUserDto: CreateUserDto = {
        email: 'newuser@example.com',
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      mockUserRepository.findOne.mockResolvedValue(null); // Email n'existe pas
      mockUserRepository.create.mockReturnValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);

      const result = await service.create(createUserDto);

      expect(result).toEqual(mockUserResponse);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: createUserDto.email },
      });
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        ...createUserDto,
        organizationId: undefined,
      });
      expect(mockUserRepository.save).toHaveBeenCalledWith(mockUser);
    });

    it('should throw conflict error if email already exists', async () => {
      const createUserDto: CreateUserDto = {
        email: 'existing@example.com',
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.create(createUserDto)).rejects.toThrow(
        new HttpException('Cet email est déjà utilisé', HttpStatus.CONFLICT),
      );
    });

    it('should create user with organization by name', async () => {
      const createUserDto: CreateUserDto = {
        email: 'newuser@example.com',
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Smith',
        organizationName: 'Test Org',
      };

      const mockOrganization = {
        id: 'org-123',
        name: 'Test Org',
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockOrganizationService.findAll.mockResolvedValue([mockOrganization]);
      mockOrganizationService.hasReachedUserLimit.mockResolvedValue(false);
      mockUserRepository.create.mockReturnValue({ ...mockUser, organizationId: 'org-123' });
      mockUserRepository.save.mockResolvedValue({ ...mockUser, organizationId: 'org-123' });

      const result = await service.create(createUserDto);

      expect(result.organizationId).toBe('org-123');
      expect(mockOrganizationService.findAll).toHaveBeenCalled();
      expect(mockOrganizationService.hasReachedUserLimit).toHaveBeenCalledWith('org-123');
    });

    it('should throw error if organization not found', async () => {
      const createUserDto: CreateUserDto = {
        email: 'newuser@example.com',
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Smith',
        organizationName: 'NonExistent Org',
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockOrganizationService.findAll.mockResolvedValue([]);

      await expect(service.create(createUserDto)).rejects.toThrow(
        new HttpException(
          'Organisation "NonExistent Org" introuvable',
          HttpStatus.NOT_FOUND,
        ),
      );
    });

    it('should throw error if organization reached user limit', async () => {
      const createUserDto: CreateUserDto = {
        email: 'newuser@example.com',
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Smith',
        organizationName: 'Test Org',
      };

      const mockOrganization = {
        id: 'org-123',
        name: 'Test Org',
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockOrganizationService.findAll.mockResolvedValue([mockOrganization]);
      mockOrganizationService.hasReachedUserLimit.mockResolvedValue(true);

      await expect(service.create(createUserDto)).rejects.toThrow(
        new HttpException(
          "Cette organisation a atteint sa limite d'utilisateurs",
          HttpStatus.FORBIDDEN,
        ),
      );
    });
  });

  describe('findAll', () => {
    it('should return all users without passwords', async () => {
      const users = [mockUser, { ...mockUser, id: 'user-2', email: 'user2@example.com' }];
      mockUserRepository.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('password');
      expect(mockUserRepository.find).toHaveBeenCalledWith({
        select: ['id', 'email', 'firstName', 'lastName', 'role', 'organizationId', 'isActive', 'emailVerified', 'createdAt', 'lastLoginAt'],
      });
    });

    it('should return empty array when no users', async () => {
      mockUserRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return a user by id', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findById(mockUser.id);

      expect(result).toEqual(mockUserResponse);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: ['id', 'email', 'firstName', 'lastName', 'role', 'organizationId', 'isActive', 'emailVerified', 'createdAt', 'lastLoginAt'],
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('should return user with password for login', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(result).toHaveProperty('password');
    });

    it('should return null if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByOrganization', () => {
    it('should return users from specific organization', async () => {
      const orgUsers = [
        { ...mockUser, organizationId: 'org-123' },
        { ...mockUser, id: 'user-2', organizationId: 'org-123' },
      ];

      mockUserRepository.find.mockResolvedValue(orgUsers);

      const result = await service.findByOrganization('org-123');

      expect(result).toHaveLength(2);
      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        select: expect.any(Array),
      });
    });
  });

  describe('findByRole', () => {
    it('should return users with specific role', async () => {
      const adminUsers = [
        { ...mockUser, role: UserRole.ADMIN },
        { ...mockUser, id: 'admin-2', role: UserRole.ADMIN },
      ];

      mockUserRepository.find.mockResolvedValue(adminUsers);

      const result = await service.findByRole(UserRole.ADMIN);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe(UserRole.ADMIN);
      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: { role: UserRole.ADMIN },
        select: expect.any(Array),
      });
    });
  });

  describe('findActiveUsers', () => {
    it('should return only active users', async () => {
      const activeUsers = [
        mockUser,
        { ...mockUser, id: 'user-2', isActive: true },
      ];

      mockUserRepository.find.mockResolvedValue(activeUsers);

      const result = await service.findActiveUsers();

      expect(result).toHaveLength(2);
      expect(result.every(user => user.isActive)).toBe(true);
      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: { isActive: true },
        select: expect.any(Array),
      });
    });
  });

  describe('update', () => {
    it('should update user successfully', async () => {
      const updateDto: UpdateUserDto = {
        firstName: 'Updated',
        lastName: 'Name',
      };

      const updatedUser = { ...mockUser, firstName: 'Updated', lastName: 'Name' };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(updatedUser);

      const result = await service.update(mockUser.id, updateDto);

      expect(result.firstName).toBe('Updated');
      expect(result.lastName).toBe('Name');
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('invalid-id', { firstName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw conflict error if new email already exists', async () => {
      const updateDto: UpdateUserDto = {
        email: 'existing@example.com',
      };

      mockUserRepository.findOne
        .mockResolvedValueOnce(mockUser) // Premier appel pour trouver l'utilisateur
        .mockResolvedValueOnce({ ...mockUser, id: 'other-user' }); // Deuxième appel pour vérifier l'email

      await expect(service.update(mockUser.id, updateDto)).rejects.toThrow(
        new HttpException('Cet email est déjà utilisé', HttpStatus.CONFLICT),
      );
    });
  });

  describe('delete', () => {
    it('should delete user successfully', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.remove.mockResolvedValue(mockUser);

      await service.delete(mockUser.id);

      expect(mockUserRepository.remove).toHaveBeenCalledWith(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const loginDto: LoginUserDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const userWithValidPassword = {
        ...mockUser,
        validatePassword: jest.fn().mockResolvedValue(true),
      };

      mockUserRepository.findOne.mockResolvedValue(userWithValidPassword);
      mockUserRepository.save.mockResolvedValue({
        ...userWithValidPassword,
        lastLoginAt: new Date(),
        isActive: true,
      });

      const result = await service.login(loginDto);

      expect(result.isActive).toBe(true);
      expect(userWithValidPassword.validatePassword).toHaveBeenCalledWith(loginDto.password);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw error if user not found', async () => {
      const loginDto: LoginUserDto = {
        email: 'notfound@example.com',
        password: 'Password123!',
      };

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new HttpException('Email ou mot de passe incorrect', HttpStatus.UNAUTHORIZED),
      );
    });

    it('should throw error if password invalid', async () => {
      const loginDto: LoginUserDto = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      const userWithInvalidPassword = {
        ...mockUser,
        validatePassword: jest.fn().mockResolvedValue(false),
      };

      mockUserRepository.findOne.mockResolvedValue(userWithInvalidPassword);

      await expect(service.login(loginDto)).rejects.toThrow(
        new HttpException('Email ou mot de passe incorrect', HttpStatus.UNAUTHORIZED),
      );
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      const loggedOutUser = { ...mockUser, isActive: false };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(loggedOutUser);

      const result = await service.logout(mockUser.id);

      expect(result.isActive).toBe(false);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.logout('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignToOrganization', () => {
    it('should assign user to organization', async () => {
      const mockOrganization = {
        id: 'org-123',
        name: 'Test Org',
      };

      const assignedUser = { ...mockUser, organizationId: 'org-123' };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockOrganizationService.findAll.mockResolvedValue([mockOrganization]);
      mockOrganizationService.hasReachedUserLimit.mockResolvedValue(false);
      mockUserRepository.save.mockResolvedValue(assignedUser);

      const result = await service.assignToOrganization(mockUser.id, 'Test Org');

      expect(result.organizationId).toBe('org-123');
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw error if organization not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockOrganizationService.findAll.mockResolvedValue([]);

      await expect(
        service.assignToOrganization(mockUser.id, 'NonExistent'),
      ).rejects.toThrow(
        new HttpException('Organisation "NonExistent" introuvable', HttpStatus.NOT_FOUND),
      );
    });

    it('should throw error if organization reached limit', async () => {
      const mockOrganization = { id: 'org-123', name: 'Test Org' };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockOrganizationService.findAll.mockResolvedValue([mockOrganization]);
      mockOrganizationService.hasReachedUserLimit.mockResolvedValue(true);

      await expect(
        service.assignToOrganization(mockUser.id, 'Test Org'),
      ).rejects.toThrow(
        new HttpException(
          "Cette organisation a atteint sa limite d'utilisateurs",
          HttpStatus.FORBIDDEN,
        ),
      );
    });
  });

    describe('removeFromOrganization', () => {
    it('should remove user from organization', async () => {
      const userInOrg = { ...mockUser, organizationId: 'org-123' };
      const removedUser = { ...mockUser, organizationId: null };

      mockUserRepository.findOne.mockResolvedValue(userInOrg);
      mockUserRepository.save.mockResolvedValue(removedUser);

      const result = await service.removeFromOrganization(mockUser.id);

      expect(result.organizationId).toBeNull();
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw error if user not in organization', async () => {
      const userWithoutOrg = { ...mockUser, organizationId: null };
      
      mockUserRepository.findOne.mockResolvedValue(userWithoutOrg);

      await expect(
        service.removeFromOrganization(mockUser.id),
      ).rejects.toThrow(
        new HttpException(
          "Cet utilisateur n'appartient à aucune organisation",
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.removeFromOrganization('invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeAllUsersFromOrganization', () => {
    it('should remove all users from organization', async () => {
      mockUserRepository.update.mockResolvedValue({ affected: 5 });

      const result = await service.removeAllUsersFromOrganization('org-123');

      expect(result).toBe(5);
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { organizationId: 'org-123' },
        { organizationId: null },
      );
    });

    it('should return 0 if no users affected', async () => {
      mockUserRepository.update.mockResolvedValue({ affected: 0 });

      const result = await service.removeAllUsersFromOrganization('org-123');

      expect(result).toBe(0);
    });
  });
});
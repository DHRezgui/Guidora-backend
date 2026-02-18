// user.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { NotFoundException, HttpException } from '@nestjs/common';

describe('UserController', () => {
  let controller: UserController;
  let service: UserService;

  // Mock du UserService
  const mockUserService = {
    create: jest.fn(),
    login: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByRole: jest.fn(),
    findActiveUsers: jest.fn(),
    update: jest.fn(),
    logout: jest.fn(),
    delete: jest.fn(),
    assignToOrganization: jest.fn(),
    removeFromOrganization: jest.fn(),
  };

  // Données de test réutilisables
  const mockUserResponse = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.USER,
    organizationId: null,
    isActive: true,
    emailVerified: false,
    createdAt: new Date('2026-02-04T10:00:00.000Z'),
    lastLoginAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get<UserService>(UserService);

    // Réinitialiser les mocks avant chaque test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should create a new user', async () => {
      const createUserDto: CreateUserDto = {
        email: 'newuser@example.com',
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      mockUserService.create.mockResolvedValue(mockUserResponse);

      const result = await controller.register(createUserDto);

      expect(result).toEqual({
        success: true,
        message: 'Utilisateur créé avec succès',
        user: mockUserResponse,
      });
      expect(service.create).toHaveBeenCalledWith(createUserDto);
      expect(service.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('should login a user successfully', async () => {
      const loginDto: LoginUserDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const loggedInUser = {
        ...mockUserResponse,
        lastLoginAt: new Date(),
      };

      mockUserService.login.mockResolvedValue(loggedInUser);

      const result = await controller.login(loginDto);

      expect(result).toEqual({
        success: true,
        message: 'Connexion réussie',
        user: loggedInUser,
      });
      expect(service.login).toHaveBeenCalledWith(loginDto);
      expect(service.login).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const mockUsers = [
        mockUserResponse,
        {
          ...mockUserResponse,
          id: '223e4567-e89b-12d3-a456-426614174001',
          email: 'another@example.com',
        },
      ];

      mockUserService.findAll.mockResolvedValue(mockUsers);

      const result = await controller.findAll();

      expect(result).toEqual({
        success: true,
        count: 2,
        users: mockUsers,
      });
      expect(service.findAll).toHaveBeenCalled();
      expect(service.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no users exist', async () => {
      mockUserService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual({
        success: true,
        count: 0,
        users: [],
      });
    });
  });

  describe('findByRole', () => {
    it('should return users with ADMIN role', async () => {
      const adminUsers = [
        { ...mockUserResponse, role: UserRole.ADMIN },
        { 
          ...mockUserResponse, 
          id: '223e4567-e89b-12d3-a456-426614174001',
          role: UserRole.ADMIN 
        },
      ];

      mockUserService.findByRole.mockResolvedValue(adminUsers);

      const result = await controller.findByRole(UserRole.ADMIN);

      expect(result).toEqual({
        success: true,
        count: 2,
        users: adminUsers,
      });
      expect(service.findByRole).toHaveBeenCalledWith(UserRole.ADMIN);
      expect(service.findByRole).toHaveBeenCalledTimes(1);
    });

    it('should return users with DEVELOPER role', async () => {
      const devUsers = [
        { ...mockUserResponse, role: UserRole.DEVELOPER },
      ];

      mockUserService.findByRole.mockResolvedValue(devUsers);

      const result = await controller.findByRole(UserRole.DEVELOPER);

      expect(result).toEqual({
        success: true,
        count: 1,
        users: devUsers,
      });
      expect(service.findByRole).toHaveBeenCalledWith(UserRole.DEVELOPER);
    });

    it('should return empty array when no users with specified role', async () => {
      mockUserService.findByRole.mockResolvedValue([]);

      const result = await controller.findByRole(UserRole.ADMIN);

      expect(result).toEqual({
        success: true,
        count: 0,
        users: [],
      });
    });
  });

  describe('findActiveUsers', () => {
    it('should return all active users', async () => {
      const activeUsers = [
        mockUserResponse,
        {
          ...mockUserResponse,
          id: '223e4567-e89b-12d3-a456-426614174001',
          isActive: true,
        },
      ];

      mockUserService.findActiveUsers.mockResolvedValue(activeUsers);

      const result = await controller.findActiveUsers();

      expect(result).toEqual({
        success: true,
        count: 2,
        users: activeUsers,
      });
      expect(service.findActiveUsers).toHaveBeenCalled();
      expect(service.findActiveUsers).toHaveBeenCalledTimes(1);
    });
  });

    describe('findById', () => {
    it('should return a user by id', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      
      // Ajouter mockCurrentUser
      const mockCurrentUser = {
        id: userId,
        email: 'test@example.com',
        role: UserRole.USER,
      };

      mockUserService.findById.mockResolvedValue(mockUserResponse);

      // Passer currentUser en paramètre
      const result = await controller.findById(userId, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        user: mockUserResponse,
      });
      expect(service.findById).toHaveBeenCalledWith(userId);
      expect(service.findById).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when user not found', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      
      // Mock admin user pour bypasser la vérification
      const mockAdminUser = {
        id: 'admin-id',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      };

      mockUserService.findById.mockRejectedValue(
        new NotFoundException('Utilisateur introuvable'),
      );

      // Passer admin user
      await expect(controller.findById(userId, mockAdminUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(service.findById).toHaveBeenCalledWith(userId);
    });

    // Vérifier la protection d'accès
    it('should throw ForbiddenException when user tries to view another profile', async () => {
      const userId = 'other-user-id';
      
      const mockCurrentUser = {
        id: 'my-user-id',
        email: 'me@example.com',
        role: UserRole.USER,
      };

      await expect(controller.findById(userId, mockCurrentUser)).rejects.toThrow(
        HttpException,
      );
    });

    // Admin peut voir n'importe quel profil
    it('should allow admin to view any user profile', async () => {
      const userId = 'other-user-id';
      
      const mockAdminUser = {
        id: 'admin-id',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      };

      mockUserService.findById.mockResolvedValue(mockUserResponse);

      const result = await controller.findById(userId, mockAdminUser);

      expect(result.success).toBe(true);
      expect(service.findById).toHaveBeenCalledWith(userId);
    });
  });

    describe('update', () => {
    it('should update a user', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const updateDto: UpdateUserDto = {
        firstName: 'Updated',
        lastName: 'Name',
      };

      // Ajouter mockCurrentUser
      const mockCurrentUser = {
        id: userId,
        email: 'test@example.com',
        role: UserRole.USER,
      };

      const updatedUser = {
        ...mockUserResponse,
        firstName: 'Updated',
        lastName: 'Name',
      };

      mockUserService.update.mockResolvedValue(updatedUser);

      // Passer currentUser
      const result = await controller.update(userId, updateDto, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Utilisateur mis à jour avec succès',
        user: updatedUser,
      });
      expect(service.update).toHaveBeenCalledWith(userId, updateDto);
    });

    // User ne peut pas modifier un autre profil
    it('should throw ForbiddenException when user tries to update another profile', async () => {
      const userId = 'other-user-id';
      const updateDto: UpdateUserDto = { firstName: 'Hack' };
      
      const mockCurrentUser = {
        id: 'my-user-id',
        email: 'me@example.com',
        role: UserRole.USER,
      };

      await expect(
        controller.update(userId, updateDto, mockCurrentUser),
      ).rejects.toThrow(HttpException);
    });

    // User ne peut pas changer son propre rôle
    it('should throw ForbiddenException when user tries to change own role', async () => {
      const userId = 'my-user-id';
      const updateDto: UpdateUserDto = { role: UserRole.ADMIN };
      
      const mockCurrentUser = {
        id: userId,
        email: 'me@example.com',
        role: UserRole.USER,
      };

      await expect(
        controller.update(userId, updateDto, mockCurrentUser),
      ).rejects.toThrow(HttpException);
    });

    // Admin peut tout modifier
    it('should allow admin to update any user', async () => {
      const userId = 'other-user-id';
      const updateDto: UpdateUserDto = { role: UserRole.DEVELOPER };
      
      const mockAdminUser = {
        id: 'admin-id',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      };

      const updatedUser = {
        ...mockUserResponse,
        role: UserRole.DEVELOPER,
      };

      mockUserService.update.mockResolvedValue(updatedUser);

      const result = await controller.update(userId, updateDto, mockAdminUser);

      expect(result.success).toBe(true);
    });
  });

    describe('logout', () => {
    it('should logout a user', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';

      // Ajouter mockCurrentUser
      const mockCurrentUser = {
        id: userId,
        email: 'test@example.com',
        role: UserRole.USER,
      };

      const loggedOutUser = { ...mockUserResponse, isActive: false };

      mockUserService.logout.mockResolvedValue(loggedOutUser);

      // Passer currentUser
      const result = await controller.logout(userId, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Déconnexion réussie',
        user: loggedOutUser,
      });
      expect(service.logout).toHaveBeenCalledWith(userId);
    });

    // User ne peut pas déconnecter un autre user
    it('should throw ForbiddenException when user tries to logout another user', async () => {
      const userId = 'other-user-id';
      
      const mockCurrentUser = {
        id: 'my-user-id',
        email: 'me@example.com',
        role: UserRole.USER,
      };

      await expect(controller.logout(userId, mockCurrentUser)).rejects.toThrow(
        HttpException,
      );
    });

    // Admin peut déconnecter n'importe qui
    it('should allow admin to logout any user', async () => {
      const userId = 'other-user-id';
      
      const mockAdminUser = {
        id: 'admin-id',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      };

      const loggedOutUser = { ...mockUserResponse, isActive: false };
      mockUserService.logout.mockResolvedValue(loggedOutUser);

      const result = await controller.logout(userId, mockAdminUser);

      expect(result.success).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete a user', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';

      mockUserService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(userId);

      expect(result).toEqual({
        success: true,
        message: 'Utilisateur supprimé avec succès',
      });
      expect(service.delete).toHaveBeenCalledWith(userId);
      expect(service.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('assignToOrganization', () => {
    it('should assign user to an organization', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const organizationName = 'Test Organization';

      const assignedUser = {
        ...mockUserResponse,
        organizationId: 'org-123',
      };

      mockUserService.assignToOrganization.mockResolvedValue(assignedUser);

      const result = await controller.assignToOrganization(userId, organizationName);

      expect(result).toEqual({
        success: true,
        message: "Utilisateur assigné à l'organisation avec succès",
        user: assignedUser,
      });
      expect(service.assignToOrganization).toHaveBeenCalledWith(userId, organizationName);
      expect(service.assignToOrganization).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeFromOrganization', () => {
    it('should remove user from organization', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';

      const removedUser = {
        ...mockUserResponse,
        organizationId: null,
      };

      mockUserService.removeFromOrganization.mockResolvedValue(removedUser);

      const result = await controller.removeFromOrganization(userId);

      expect(result).toEqual({
        success: true,
        message: "Utilisateur retiré de l'organisation avec succès",
        user: removedUser,
      });
      expect(service.removeFromOrganization).toHaveBeenCalledWith(userId);
      expect(service.removeFromOrganization).toHaveBeenCalledTimes(1);
    });
  });
});
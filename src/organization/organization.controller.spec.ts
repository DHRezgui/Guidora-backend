// organization.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { PlanType } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { NotFoundException } from '@nestjs/common';

describe('OrganizationController', () => {
  let controller: OrganizationController;
  let service: OrganizationService;

  // Mock du OrganizationService
  const mockOrganizationService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByIdWithUsers: jest.fn(),
    countUsers: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  // Données de test
  const mockOrganizationResponse = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Organization',
    apiKey: 'test-api-key-123',
    plan: PlanType.PRO,
    domain: 'testorg.com',
    settings: {},
    maxTours: 50,
    maxUsers: 100,
    isActive: true,
    createdAt: new Date('2026-02-04T10:00:00.000Z'),
    updatedAt: new Date('2026-02-04T10:00:00.000Z'),
  };

  const mockOrganizationWithUsers = {
    ...mockOrganizationResponse,
    userCount: 2,
    users: [
      {
        id: 'user-1',
        email: 'user1@example.com',
        firstName: 'John',
        lastName: 'Doe',
      },
      {
        id: 'user-2',
        email: 'user2@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationController],
      providers: [
        {
          provide: OrganizationService,
          useValue: mockOrganizationService,
        },
      ],
    }).compile();

    controller = module.get<OrganizationController>(OrganizationController);
    service = module.get<OrganizationService>(OrganizationService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new organization', async () => {
      const createDto: CreateOrganizationDto = {
        name: 'New Organization',
        apiKey: 'new-api-key',
        plan: PlanType.STARTER,
      };

      mockOrganizationService.create.mockResolvedValue(mockOrganizationResponse);

      const result = await controller.create(createDto);

      expect(result).toEqual({
        success: true,
        message: 'Organisation créée avec succès',
        organization: mockOrganizationResponse,
      });
      expect(service.create).toHaveBeenCalledWith(createDto);
      expect(service.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('should return all organizations', async () => {
      const organizations = [
        mockOrganizationResponse,
        {
          ...mockOrganizationResponse,
          id: 'org-2',
          name: 'Second Organization',
        },
      ];

      mockOrganizationService.findAll.mockResolvedValue(organizations);

      const result = await controller.findAll();

      expect(result).toEqual({
        success: true,
        count: 2,
        organizations,
      });
      expect(service.findAll).toHaveBeenCalled();
      expect(service.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no organizations exist', async () => {
      mockOrganizationService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual({
        success: true,
        count: 0,
        organizations: [],
      });
    });
  });

  describe('findById', () => {
    it('should return an organization by id', async () => {
      const orgId = '123e4567-e89b-12d3-a456-426614174000';

      mockOrganizationService.findById.mockResolvedValue(mockOrganizationResponse);

      const result = await controller.findById(orgId);

      expect(result).toEqual({
        success: true,
        organization: mockOrganizationResponse,
      });
      expect(service.findById).toHaveBeenCalledWith(orgId);
      expect(service.findById).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when organization not found', async () => {
      const orgId = 'invalid-id';

      mockOrganizationService.findById.mockRejectedValue(
        new NotFoundException('Organisation introuvable'),
      );

      await expect(controller.findById(orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByIdWithUsers', () => {
    it('should return organization with its users', async () => {
      const orgId = '123e4567-e89b-12d3-a456-426614174000';

      mockOrganizationService.findByIdWithUsers.mockResolvedValue(
        mockOrganizationWithUsers,
      );

      const result = await controller.findByIdWithUsers(orgId);

      expect(result).toEqual({
        success: true,
        organization: mockOrganizationWithUsers,
      });
      expect(result.organization.userCount).toBe(2);
      expect(result.organization.users).toHaveLength(2);
      expect(service.findByIdWithUsers).toHaveBeenCalledWith(orgId);
    });

    it('should return organization with empty users array', async () => {
      const orgId = '123e4567-e89b-12d3-a456-426614174000';
      const orgWithoutUsers = {
        ...mockOrganizationResponse,
        userCount: 0,
        users: [],
      };

      mockOrganizationService.findByIdWithUsers.mockResolvedValue(
        orgWithoutUsers,
      );

      const result = await controller.findByIdWithUsers(orgId);

      expect(result.organization.userCount).toBe(0);
      expect(result.organization.users).toHaveLength(0);
    });
  });

  describe('countUsers', () => {
    it('should return user count for organization', async () => {
      const orgId = '123e4567-e89b-12d3-a456-426614174000';
      mockOrganizationService.countUsers.mockResolvedValue(5);

      const result = await controller.countUsers(orgId);

      expect(result).toEqual({
        success: true,
        count: 5,
      });
      expect(service.countUsers).toHaveBeenCalledWith(orgId);
    });

    it('should return 0 when no users in organization', async () => {
      const orgId = '123e4567-e89b-12d3-a456-426614174000';
      mockOrganizationService.countUsers.mockResolvedValue(0);

      const result = await controller.countUsers(orgId);

      expect(result.count).toBe(0);
    });
  });

  describe('update', () => {
    it('should update an organization', async () => {
      const orgId = '123e4567-e89b-12d3-a456-426614174000';
      const updateDto: UpdateOrganizationDto = {
        name: 'Updated Organization',
        plan: PlanType.ENTERPRISE,
      };

      const updatedOrg = {
        ...mockOrganizationResponse,
        name: 'Updated Organization',
        plan: PlanType.ENTERPRISE,
      };

      mockOrganizationService.update.mockResolvedValue(updatedOrg);

      const result = await controller.update(orgId, updateDto);

      expect(result).toEqual({
        success: true,
        message: 'Organisation mise à jour avec succès',
        organization: updatedOrg,
      });
      expect(service.update).toHaveBeenCalledWith(orgId, updateDto);
    });
  });

  describe('delete', () => {
    it('should delete an organization', async () => {
      const orgId = '123e4567-e89b-12d3-a456-426614174000';

      mockOrganizationService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(orgId);

      expect(result).toEqual({
        success: true,
        message: 'Organisation supprimée avec succès',
      });
      expect(service.delete).toHaveBeenCalledWith(orgId);
    });

    it('should throw NotFoundException when deleting non-existent organization', async () => {
      const orgId = 'invalid-id';

      mockOrganizationService.delete.mockRejectedValue(
        new NotFoundException('Organisation introuvable'),
      );

      await expect(controller.delete(orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
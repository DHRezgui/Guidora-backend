// organization.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from './organization.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization, PlanType } from './entities/organization.entity';
import { NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

describe('OrganizationService', () => {
  let service: OrganizationService;
  let repository: Repository<Organization>;

  // Mock du Repository
  const mockOrganizationRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  // Données de test
  const mockOrganization: Organization = {
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
    users: [],
  } as any;

  const mockOrganizationResponse = {
    id: mockOrganization.id,
    name: mockOrganization.name,
    apiKey: mockOrganization.apiKey,
    plan: mockOrganization.plan,
    domain: mockOrganization.domain,
    settings: mockOrganization.settings,
    maxTours: mockOrganization.maxTours,
    maxUsers: mockOrganization.maxUsers,
    isActive: mockOrganization.isActive,
    createdAt: mockOrganization.createdAt,
    updatedAt: mockOrganization.updatedAt,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        {
          provide: getRepositoryToken(Organization),
          useValue: mockOrganizationRepository,
        },
      ],
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
    repository = module.get<Repository<Organization>>(
      getRepositoryToken(Organization),
    );

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new organization', async () => {
      const createDto: CreateOrganizationDto = {
        name: 'New Organization',
        apiKey: 'new-api-key',
        plan: PlanType.STARTER,
      };

      mockOrganizationRepository.findOne.mockResolvedValue(null); // API key doesn't exist
      mockOrganizationRepository.create.mockReturnValue(mockOrganization);
      mockOrganizationRepository.save.mockResolvedValue(mockOrganization);

      const result = await service.create(createDto);

      expect(result).toEqual(mockOrganizationResponse);
      expect(mockOrganizationRepository.findOne).toHaveBeenCalledWith({
        where: { apiKey: createDto.apiKey },
      });
      expect(mockOrganizationRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockOrganizationRepository.save).toHaveBeenCalled();
    });

    it('should throw conflict error if API key already exists', async () => {
      const createDto: CreateOrganizationDto = {
        name: 'New Organization',
        apiKey: 'existing-api-key',
        plan: PlanType.STARTER,
      };

      mockOrganizationRepository.findOne.mockResolvedValue(mockOrganization);

      await expect(service.create(createDto)).rejects.toThrow(
        new HttpException('Cette clé API est déjà utilisée', HttpStatus.CONFLICT),
      );
    });
  });

  describe('findAll', () => {
    it('should return all organizations', async () => {
      const organizations = [
        mockOrganization,
        { ...mockOrganization, id: 'org-2', name: 'Second Org' },
      ];

      mockOrganizationRepository.find.mockResolvedValue(organizations);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(mockOrganizationRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no organizations exist', async () => {
      mockOrganizationRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return an organization by id', async () => {
      mockOrganizationRepository.findOne.mockResolvedValue(mockOrganization);

      const result = await service.findById(mockOrganization.id);

      expect(result).toEqual(mockOrganizationResponse);
      expect(mockOrganizationRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockOrganization.id },
      });
    });

    it('should throw NotFoundException if organization not found', async () => {
      mockOrganizationRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByApiKey', () => {
    it('should return organization by API key', async () => {
      mockOrganizationRepository.findOne.mockResolvedValue(mockOrganization);

      const result = await service.findByApiKey('test-api-key-123');

      expect(result).toEqual(mockOrganization);
      expect(mockOrganizationRepository.findOne).toHaveBeenCalledWith({
        where: { apiKey: 'test-api-key-123' },
      });
    });

    it('should return null if not found', async () => {
      mockOrganizationRepository.findOne.mockResolvedValue(null);

      const result = await service.findByApiKey('non-existent-key');

      expect(result).toBeNull();
    });
  });

  describe('findByIdWithUsers', () => {
    it('should return organization with users', async () => {
      const orgWithUsers = {
        ...mockOrganization,
        users: [
          {
            id: 'user-1',
            email: 'user1@example.com',
            password: 'hashed-password',
            firstName: 'John',
            lastName: 'Doe',
          },
          {
            id: 'user-2',
            email: 'user2@example.com',
            password: 'hashed-password',
            firstName: 'Jane',
            lastName: 'Smith',
          },
        ],
      };

      mockOrganizationRepository.findOne.mockResolvedValue(orgWithUsers);

      const result = await service.findByIdWithUsers(mockOrganization.id);

      expect(result.userCount).toBe(2);
      expect(result.users).toHaveLength(2);
      expect(result.users[0]).not.toHaveProperty('password');
      expect(mockOrganizationRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockOrganization.id },
        relations: ['users'],
      });
    });

    it('should return organization with empty users array', async () => {
      const orgWithoutUsers = {
        ...mockOrganization,
        users: [],
      };

      mockOrganizationRepository.findOne.mockResolvedValue(orgWithoutUsers);

      const result = await service.findByIdWithUsers(mockOrganization.id);

      expect(result.userCount).toBe(0);
      expect(result.users).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update an organization', async () => {
      const updateDto: UpdateOrganizationDto = {
        name: 'Updated Name',
        plan: PlanType.ENTERPRISE,
      };

      const updatedOrg = {
        ...mockOrganization,
        name: 'Updated Name',
        plan: PlanType.ENTERPRISE,
      };

      mockOrganizationRepository.findOne.mockResolvedValue(mockOrganization);
      mockOrganizationRepository.save.mockResolvedValue(updatedOrg);

      const result = await service.update(mockOrganization.id, updateDto);

      expect(result.name).toBe('Updated Name');
      expect(result.plan).toBe(PlanType.ENTERPRISE);
      expect(mockOrganizationRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if organization not found', async () => {
      mockOrganizationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('invalid-id', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw conflict error if new API key already exists', async () => {
      const updateDto: UpdateOrganizationDto = {
        apiKey: 'existing-key',
      };

      mockOrganizationRepository.findOne
        .mockResolvedValueOnce(mockOrganization) // First call
        .mockResolvedValueOnce({ ...mockOrganization, id: 'other-org' }); // Second call

      await expect(
        service.update(mockOrganization.id, updateDto),
      ).rejects.toThrow(
        new HttpException('Cette clé API est déjà utilisée', HttpStatus.CONFLICT),
      );
    });
  });

  describe('delete', () => {
    it('should delete an organization', async () => {
      mockOrganizationRepository.findOne.mockResolvedValue(mockOrganization);
      mockOrganizationRepository.remove.mockResolvedValue(mockOrganization);

      await service.delete(mockOrganization.id);

      expect(mockOrganizationRepository.remove).toHaveBeenCalledWith(
        mockOrganization,
      );
    });

    it('should throw NotFoundException if organization not found', async () => {
      mockOrganizationRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('countUsers', () => {
    it('should count users in organization', async () => {
      const orgWithUsers = {
        ...mockOrganization,
        users: [
          { id: 'user-1' },
          { id: 'user-2' },
          { id: 'user-3' },
        ],
      };

      mockOrganizationRepository.findOne.mockResolvedValue(orgWithUsers);

      const result = await service.countUsers(mockOrganization.id);

      expect(result).toBe(3);
    });

    it('should return 0 when no users', async () => {
      const orgWithoutUsers = {
        ...mockOrganization,
        users: [],
      };

      mockOrganizationRepository.findOne.mockResolvedValue(orgWithoutUsers);

      const result = await service.countUsers(mockOrganization.id);

      expect(result).toBe(0);
    });
  });

  describe('hasReachedUserLimit', () => {
    it('should return true if user limit reached', async () => {
      const orgWithMaxUsers = {
        ...mockOrganization,
        maxUsers: 2,
        users: [{ id: 'user-1' }, { id: 'user-2' }],
      };

      mockOrganizationRepository.findOne
        .mockResolvedValueOnce(orgWithMaxUsers) // For hasReachedUserLimit
        .mockResolvedValueOnce(orgWithMaxUsers); // For countUsers

      const result = await service.hasReachedUserLimit(mockOrganization.id);

      expect(result).toBe(true);
    });

    it('should return false if under user limit', async () => {
      const orgUnderLimit = {
        ...mockOrganization,
        maxUsers: 10,
        users: [{ id: 'user-1' }],
      };

      mockOrganizationRepository.findOne
        .mockResolvedValueOnce(orgUnderLimit)
        .mockResolvedValueOnce(orgUnderLimit);

      const result = await service.hasReachedUserLimit(mockOrganization.id);

      expect(result).toBe(false);
    });
  });

  describe('deleteWithUsers', () => {
    it('should delete organization and return affected users count', async () => {
      const orgWithUsers = {
        ...mockOrganization,
        users: [{ id: 'user-1' }, { id: 'user-2' }],
      };

      mockOrganizationRepository.findOne.mockResolvedValue(orgWithUsers);
      mockOrganizationRepository.remove.mockResolvedValue(orgWithUsers);

      const result = await service.deleteWithUsers(mockOrganization.id);

      expect(result).toEqual({ usersAffected: 2 });
      expect(mockOrganizationRepository.remove).toHaveBeenCalledWith(
        orgWithUsers,
      );
    });

    it('should return 0 users affected when no users', async () => {
      const orgWithoutUsers = {
        ...mockOrganization,
        users: [],
      };

      mockOrganizationRepository.findOne.mockResolvedValue(orgWithoutUsers);
      mockOrganizationRepository.remove.mockResolvedValue(orgWithoutUsers);

      const result = await service.deleteWithUsers(mockOrganization.id);

      expect(result).toEqual({ usersAffected: 0 });
    });
  });
});
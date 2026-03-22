import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { GuidedTourService } from './guided-tour.service';
import { GuidedTour } from './entities/guided-tour.entity';
import { Step } from '../step/entities/step.entity';
import { OrganizationService } from '../organization/organization.service';
import { CreateGuidedTourDto } from './dto/create-guided-tour.dto';
import { UpdateGuidedTourDto } from './dto/update-guided-tour.dto';
import { PositionType, ActionType } from '../step/enums/tour.enums';

describe('GuidedTourService', () => {
  let service: GuidedTourService;

  const mockTourRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockStepRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockOrganizationService = {
    findById: jest.fn(),
  };

  const orgId = 'org-uuid-1234';
  const userId = 'user-uuid-1234';

  const mockStepEntity = {
    id: 'step-uuid-1',
    tourId: 'tour-uuid-1234',
    orderIndex: 1,
    title: 'Bienvenue !',
    content: 'Cliquez ici pour commencer',
    targetSelector: '#transfer-button',
    position: PositionType.BOTTOM,
    action: ActionType.CLICK,
    skipAllowed: true,
    highlightElement: true,
    createdAt: new Date('2026-02-15T10:30:00.000Z'),
    updatedAt: new Date('2026-02-15T10:30:00.000Z'),
  };

  const mockTourEntity = {
    id: 'tour-uuid-1234',
    name: 'Premier virement',
    description: 'Guide pas-à-pas pour effectuer votre premier virement bancaire',
    targetUrl: '/dashboard/transfers',
    isActive: true,
    priority: 10,
    triggerConditions: { minTimeOnPage: 30 },
    organizationId: orgId,
    createdBy: userId,
    createdAt: new Date('2026-02-15T10:30:00.000Z'),
    updatedAt: new Date('2026-02-15T10:30:00.000Z'),
    steps: [mockStepEntity],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuidedTourService,
        {
          provide: getRepositoryToken(GuidedTour),
          useValue: mockTourRepository,
        },
        {
          provide: getRepositoryToken(Step),
          useValue: mockStepRepository,
        },
        {
          provide: OrganizationService,
          useValue: mockOrganizationService,
        },
      ],
    }).compile();

    service = module.get<GuidedTourService>(GuidedTourService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should create a guided tour with steps', async () => {
      const createTourDto: CreateGuidedTourDto = {
        name: 'Premier virement',
        description: 'Guide pas-à-pas',
        targetUrl: '/dashboard/transfers',
        isActive: true,
        priority: 10,
        triggerConditions: { minTimeOnPage: 30 },
        steps: [
          {
            title: 'Bienvenue !',
            content: 'Cliquez ici pour commencer',
            targetSelector: '#transfer-button',
            position: PositionType.BOTTOM,
            action: ActionType.CLICK,
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.create.mockReturnValue({ ...createTourDto, organizationId: orgId, createdBy: userId });
      mockTourRepository.save.mockResolvedValue({ id: 'tour-uuid-1234', ...createTourDto, organizationId: orgId });
      mockStepRepository.create.mockReturnValue(mockStepEntity);
      mockStepRepository.save.mockResolvedValue([mockStepEntity]);
      mockTourRepository.findOneOrFail.mockResolvedValue(mockTourEntity);

      const result = await service.create(createTourDto, orgId, userId);

      expect(result).toEqual(mockTourEntity);
      expect(mockOrganizationService.findById).toHaveBeenCalledWith(orgId);
      expect(mockTourRepository.create).toHaveBeenCalledWith({
        name: 'Premier virement',
        description: 'Guide pas-à-pas',
        targetUrl: '/dashboard/transfers',
        isActive: true,
        priority: 10,
        organizationId: orgId,
        createdBy: userId,
        triggerConditions: { minTimeOnPage: 30 },
      });
      expect(mockTourRepository.save).toHaveBeenCalled();
      expect(mockStepRepository.create).toHaveBeenCalled();
      expect(mockStepRepository.save).toHaveBeenCalled();
    });

    it('should set default triggerConditions to empty object when not provided', async () => {
      const createTourDto: CreateGuidedTourDto = {
        name: 'Tour simple',
        targetUrl: '/page',
        steps: [{ title: 'Étape', content: 'Contenu' }],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.create.mockReturnValue({});
      mockTourRepository.save.mockResolvedValue({ id: 'new-tour' });
      mockStepRepository.create.mockReturnValue({});
      mockStepRepository.save.mockResolvedValue([]);
      mockTourRepository.findOneOrFail.mockResolvedValue(mockTourEntity);

      await service.create(createTourDto, orgId, userId);

      expect(mockTourRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ triggerConditions: {} }),
      );
    });

    it('should assign orderIndex sequentially to steps', async () => {
      const createTourDto: CreateGuidedTourDto = {
        name: 'Tour multi-steps',
        targetUrl: '/page',
        steps: [
          { title: 'Étape 1', content: 'Contenu 1' },
          { title: 'Étape 2', content: 'Contenu 2' },
          { title: 'Étape 3', content: 'Contenu 3' },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.create.mockReturnValue({});
      mockTourRepository.save.mockResolvedValue({ id: 'tour-id' });
      mockStepRepository.create.mockImplementation((data) => data);
      mockStepRepository.save.mockResolvedValue([]);
      mockTourRepository.findOneOrFail.mockResolvedValue(mockTourEntity);

      await service.create(createTourDto, orgId, userId);

      expect(mockStepRepository.create).toHaveBeenCalledTimes(3);
      expect(mockStepRepository.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ orderIndex: 1 }));
      expect(mockStepRepository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ orderIndex: 2 }));
      expect(mockStepRepository.create).toHaveBeenNthCalledWith(3, expect.objectContaining({ orderIndex: 3 }));
    });

    it('should throw if organization does not exist', async () => {
      const createTourDto: CreateGuidedTourDto = {
        name: 'Test',
        targetUrl: '/test',
        steps: [{ title: 'Étape', content: 'Contenu' }],
      };

      mockOrganizationService.findById.mockRejectedValue(
        new NotFoundException('Organisation introuvable'),
      );

      await expect(service.create(createTourDto, 'bad-org', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─────────────────────────────────────────────
  describe('findAllByOrganization', () => {
    it('should return all tours for an organization', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTourEntity]),
      };

      mockTourRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAllByOrganization(orgId);

      expect(result).toEqual([mockTourEntity]);
      expect(mockTourRepository.createQueryBuilder).toHaveBeenCalledWith('tour');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'tour.organization_id = :organizationId',
        { organizationId: orgId },
      );
    });

    it('should filter by isActive when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTourEntity]),
      };

      mockTourRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAllByOrganization(orgId, true);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'tour.is_active = :isActive',
        { isActive: true },
      );
    });

    it('should not filter by isActive when undefined', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockTourRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAllByOrganization(orgId, undefined);

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('should return empty array when no tours exist', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockTourRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAllByOrganization(orgId);

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  describe('findById', () => {
    it('should return a tour by ID and organizationId', async () => {
      const tourWithUnsortedSteps = {
        ...mockTourEntity,
        steps: [
          { ...mockStepEntity, orderIndex: 2 },
          { ...mockStepEntity, id: 'step-2', orderIndex: 1 },
        ],
      };

      mockTourRepository.findOne.mockResolvedValue(tourWithUnsortedSteps);

      const result = await service.findById('tour-uuid-1234', orgId);

      // Steps should be sorted by orderIndex
      expect(result.steps[0].orderIndex).toBe(1);
      expect(result.steps[1].orderIndex).toBe(2);
    });

    it('should throw NotFoundException if tour does not exist', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('nonexistent', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if tour belongs to another organization', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('tour-uuid-1234', 'other-org')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─────────────────────────────────────────────
  describe('update', () => {
    it('should update tour fields successfully', async () => {
      const updateDto: UpdateGuidedTourDto = {
        name: 'Updated Name',
        priority: 20,
      };

      const existingTour = {
        ...mockTourEntity,
        steps: [mockStepEntity],
      };

      mockTourRepository.findOne.mockResolvedValue(existingTour);
      mockTourRepository.save.mockResolvedValue({ ...existingTour, ...updateDto });
      // findById is called again after update to return fresh data
      mockTourRepository.findOne.mockResolvedValue({ ...existingTour, ...updateDto });

      const result = await service.update('tour-uuid-1234', updateDto, orgId);

      expect(result.name).toBe('Updated Name');
      expect(mockTourRepository.save).toHaveBeenCalled();
    });

    it('should replace steps when steps array is provided', async () => {
      const updateDto: UpdateGuidedTourDto = {
        steps: [
          { title: 'New Step 1', content: 'New Content 1' },
          { title: 'New Step 2', content: 'New Content 2' },
        ],
      };

      const existingTour = { ...mockTourEntity, steps: [mockStepEntity] };

      mockTourRepository.findOne.mockResolvedValue(existingTour);
      mockTourRepository.save.mockResolvedValue(existingTour);
      mockStepRepository.delete.mockResolvedValue({ affected: 1 });
      mockStepRepository.create.mockImplementation((data) => data);
      mockStepRepository.save.mockResolvedValue([]);

      await service.update('tour-uuid-1234', updateDto, orgId);

      expect(mockStepRepository.delete).toHaveBeenCalledWith({ tourId: 'tour-uuid-1234' });
      expect(mockStepRepository.create).toHaveBeenCalledTimes(2);
    });

    it('should merge triggerConditions on update', async () => {
      const existingTour = {
        ...mockTourEntity,
        triggerConditions: { minTimeOnPage: 30 },
        steps: [mockStepEntity],
      };

      const updateDto: UpdateGuidedTourDto = {
        triggerConditions: { userSegment: 'premium' },
      };

      mockTourRepository.findOne.mockResolvedValue(existingTour);
      mockTourRepository.save.mockResolvedValue(existingTour);

      await service.update('tour-uuid-1234', updateDto, orgId);

      expect(existingTour.triggerConditions).toEqual({
        minTimeOnPage: 30,
        userSegment: 'premium',
      });
    });

    it('should throw NotFoundException when updating nonexistent tour', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'x' }, orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('delete', () => {
    it('should hard-delete a tour', async () => {
      mockTourRepository.delete.mockResolvedValue({ affected: 1 });

      await service.delete('tour-uuid-1234', orgId);

      expect(mockTourRepository.delete).toHaveBeenCalledWith({
        id: 'tour-uuid-1234',
        organizationId: orgId,
      });
    });

    it('should throw NotFoundException when deleting nonexistent tour', async () => {
      mockTourRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.delete('nonexistent', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─────────────────────────────────────────────
  describe('toggleActive', () => {
    it('should activate an inactive tour', async () => {
      const inactiveTour = { ...mockTourEntity, isActive: false, steps: [mockStepEntity] };

      mockTourRepository.findOne.mockResolvedValue(inactiveTour);
      mockTourRepository.save.mockResolvedValue({ ...inactiveTour, isActive: true });

      const result = await service.toggleActive('tour-uuid-1234', orgId, true);

      expect(result.isActive).toBe(true);
    });

    it('should deactivate an active tour', async () => {
      const activeTour = { ...mockTourEntity, isActive: true, steps: [mockStepEntity] };

      mockTourRepository.findOne.mockResolvedValue(activeTour);
      mockTourRepository.save.mockResolvedValue({ ...activeTour, isActive: false });

      const result = await service.toggleActive('tour-uuid-1234', orgId, false);

      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException when toggling nonexistent tour', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(
        service.toggleActive('nonexistent', orgId, true),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('findActiveToursForUrl', () => {
    it('should return active tours matching a URL', async () => {
      mockTourRepository.find.mockResolvedValue([mockTourEntity]);

      const result = await service.findActiveToursForUrl('/dashboard/transfers', orgId);

      expect(result).toEqual([mockTourEntity]);
      expect(mockTourRepository.find).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          targetUrl: '/dashboard/transfers',
          isActive: true,
        },
        relations: ['steps'],
        order: { priority: 'DESC' },
      });
    });

    it('should return empty array when no active tours match', async () => {
      mockTourRepository.find.mockResolvedValue([]);

      const result = await service.findActiveToursForUrl('/nonexistent', orgId);

      expect(result).toEqual([]);
    });
  });
});

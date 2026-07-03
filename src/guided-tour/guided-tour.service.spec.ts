import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { GuidedTourService } from './guided-tour.service';
import { GuidedTour } from './entities/guided-tour.entity';
import { TourUserState } from './entities/tour-user-state.entity';
import { Step } from '../step/entities/step.entity';
import { User } from '../user/entities/user.entity';
import { TourSemanticPythonWorkerService } from './tour-semantic-python-worker.service';
import { OrganizationService } from '../organization/organization.service';
import { CreateGuidedTourDto } from './dto/create-guided-tour.dto';
import { UpdateGuidedTourDto } from './dto/update-guided-tour.dto';
import { PositionType, ActionType } from '../step/enums/tour.enums';
import { ContextualScenario, PublishContextualDraftsDto } from './dto/publish-contextual-drafts.dto';
import { UserRole } from '../user/entities/user.entity';
import { TourEnvironment, TourSandboxStatus } from './entities/guided-tour.entity';
import { GuidedTourAccessGrant } from './entities/guided-tour-access-grant.entity';
import { FaqEntryService } from '../faq/faq-entry.service';

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
    insert: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockTourUserStateRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  const mockUserRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockAccessGrantRepository = {
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
  };

  const mockTourSemanticWorker = {
    warmup: jest.fn(),
    inferRoles: jest.fn(),
  };

  const mockOrganizationService = {
    findById: jest.fn(),
  };

  const mockFaqEntryService = {
    registerProject: jest.fn().mockResolvedValue({ projectKey: 'v2', created: true }),
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
    environment: TourEnvironment.PRODUCTION,
    sandboxStatus: null,
    developerPrivate: false,
    assignedAdminIds: [] as string[],
    assignedToAdminsAt: null,
    createdAt: new Date('2026-02-15T10:30:00.000Z'),
    updatedAt: new Date('2026-02-15T10:30:00.000Z'),
    steps: [mockStepEntity],
  };

  const mockLabTourEntity = {
    ...mockTourEntity,
    targetUrl: '/dashboard/sdk-tests/simple',
    triggerConditions: {
      source: 'contextual-engine',
      contextualEngine: {
        scenario: ContextualScenario.SIMPLE,
        flowSignature: 'sig-lab-1',
      },
    },
  };

  const developerActor = {
    id: userId,
    role: UserRole.DEVELOPER,
    authMethod: 'jwt' as const,
  };

  const adminActor = {
    id: userId,
    role: UserRole.ADMIN,
    authMethod: 'jwt' as const,
  };

  const sdkTokenActor = {
    id: userId,
    role: 'SDK_TOKEN' as const,
    authMethod: 'sdk_token' as const,
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
          provide: getRepositoryToken(TourUserState),
          useValue: mockTourUserStateRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(GuidedTourAccessGrant),
          useValue: mockAccessGrantRepository,
        },
        {
          provide: OrganizationService,
          useValue: mockOrganizationService,
        },
        {
          provide: TourSemanticPythonWorkerService,
          useValue: mockTourSemanticWorker,
        },
        {
          provide: FaqEntryService,
          useValue: mockFaqEntryService,
        },
      ],
    }).compile();

    service = module.get<GuidedTourService>(GuidedTourService);

    jest.clearAllMocks();
    mockUserRepository.findOne.mockResolvedValue({ id: userId, role: UserRole.DEVELOPER });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should mark developer-created tours as private by default', async () => {
      const dto: CreateGuidedTourDto = {
        name: 'Parcours privé dev',
        targetUrl: '/app',
        steps: [{ title: 'S1', content: 'C', targetSelector: '#a', position: PositionType.BOTTOM, action: ActionType.NEXT }],
      };
      mockTourRepository.create.mockImplementation((payload) => payload);
      mockTourRepository.save.mockImplementation(async (tour) => ({ ...tour, id: 'tour-uuid-1234' }));
      mockTourRepository.findOneOrFail.mockResolvedValue({
        ...mockTourEntity,
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        developerPrivate: true,
        assignedAdminIds: [],
      });

      await service.create(dto, orgId, userId, developerActor);

      expect(mockTourRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          developerPrivate: true,
          assignedAdminIds: [],
        }),
      );
    });

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
      expect(mockTourRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Premier virement',
          description: 'Guide pas-à-pas',
          targetUrl: '/dashboard/transfers',
          isActive: true,
          priority: 10,
          organizationId: orgId,
          createdBy: userId,
          environment: TourEnvironment.PRODUCTION,
          sandboxStatus: null,
          triggerConditions: { minTimeOnPage: 30 },
        }),
      );
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
        select: jest.fn().mockReturnThis(),
        setFindOptions: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
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
        select: jest.fn().mockReturnThis(),
        setFindOptions: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTourEntity]),
      };

      mockTourRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAllByOrganization(orgId, undefined, true);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'tour.is_active = :isActive',
        { isActive: true },
      );
    });

    it('should filter by flowVersion when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        setFindOptions: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockTourEntity]),
      };

      mockTourRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAllByOrganization(orgId, undefined, undefined, true, 'test-11-v1');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("= :flowVersion"),
        { flowVersion: 'test-11-v1' },
      );
    });

    it('should filter unscoped tours when flowVersion is default', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        setFindOptions: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockTourRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAllByOrganization(orgId, undefined, undefined, true, 'default');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('IS NULL'),
        expect.objectContaining({ sdkLabPath: expect.stringContaining('sdk-tests') }),
      );
    });

    it('should not filter by isActive when undefined', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        setFindOptions: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockTourRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAllByOrganization(orgId, undefined, undefined, true);

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('should return empty array when no tours exist', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        setFindOptions: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
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

      const result = await service.update('tour-uuid-1234', updateDto, orgId, adminActor);

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

      await service.update('tour-uuid-1234', updateDto, orgId, adminActor);

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

      await service.update('tour-uuid-1234', updateDto, orgId, adminActor);

      expect(existingTour.triggerConditions).toEqual({
        minTimeOnPage: 30,
        userSegment: 'premium',
      });
    });

    it('should throw NotFoundException when updating nonexistent tour', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'x' }, orgId, adminActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject DEVELOPER updates on sdk lab template tours', async () => {
      const existingTour = { ...mockLabTourEntity, steps: [mockStepEntity] };
      const updateDto: UpdateGuidedTourDto = {
        name: 'Lab tour renamed',
        description: 'Lab description',
      };

      mockTourRepository.findOne.mockResolvedValue(existingTour);
      mockTourRepository.save.mockImplementation(async (tour) => tour);

      await expect(
        service.update('tour-uuid-1234', updateDto, orgId, developerActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject DEVELOPER updates to forbidden lab tour fields', async () => {
      mockTourRepository.findOne.mockResolvedValue({ ...mockLabTourEntity, steps: [mockStepEntity] });

      await expect(
        service.update('tour-uuid-1234', { targetUrl: '/dashboard/users' }, orgId, developerActor),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.update('tour-uuid-1234', { priority: 999 }, orgId, developerActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should set sandboxTestStartedBy when developer activates sandbox tour via update', async () => {
      const sandboxTour = {
        ...mockTourEntity,
        environment: TourEnvironment.SANDBOX,
        isActive: false,
        sandboxTestStartedBy: null,
        createdBy: userId,
        steps: [mockStepEntity],
      };

      mockTourRepository.findOne.mockResolvedValue(sandboxTour);
      mockTourRepository.save.mockImplementation(async (tour) => tour);

      const result = await service.update(
        'tour-uuid-1234',
        { isActive: true },
        orgId,
        { ...developerActor, id: userId },
      );

      expect(result.isActive).toBe(true);
      expect(result.sandboxTestStartedBy).toBe(userId);
    });

    it('should keep sandboxStatus approved when admin moves tour from production to sandbox', async () => {
      const prodTour = {
        ...mockTourEntity,
        environment: TourEnvironment.PRODUCTION,
        sandboxStatus: TourSandboxStatus.APPROVED,
        steps: [mockStepEntity],
      };

      mockTourRepository.findOne.mockResolvedValue(prodTour);
      mockTourRepository.save.mockImplementation(async (tour) => tour);

      const result = await service.update(
        'tour-uuid-1234',
        { environment: TourEnvironment.SANDBOX },
        orgId,
        adminActor,
      );

      expect(result.environment).toBe(TourEnvironment.SANDBOX);
      expect(result.sandboxStatus).toBe(TourSandboxStatus.APPROVED);
    });

    it('should reject admin promotion to production while sandbox tour is rejected', async () => {
      const rejectedTour = {
        ...mockTourEntity,
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.REJECTED,
        sandboxRejectionReason: 'Sélecteurs instables',
        steps: [mockStepEntity],
      };

      mockTourRepository.findOne.mockResolvedValue(rejectedTour);

      await expect(
        service.update(
          'tour-uuid-1234',
          { environment: TourEnvironment.PRODUCTION },
          orgId,
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should keep rejected sandbox tour rejected on developer save until manual re-assign', async () => {
      const rejectedTour = {
        ...mockTourEntity,
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.REJECTED,
        sandboxRejectionReason: 'Selectors invalides',
        sandboxRejectedAt: new Date('2026-06-01T10:00:00.000Z'),
        sandboxRejectedBy: 'admin-id',
        assignedAdminIds: ['admin-id'],
        createdBy: userId,
        steps: [mockStepEntity],
      };

      mockTourRepository.findOne.mockResolvedValue(rejectedTour);
      mockTourRepository.save.mockImplementation(async (tour) => tour);

      const result = await service.update(
        'tour-uuid-1234',
        { name: 'Parcours corrigé' },
        orgId,
        { ...developerActor, id: userId },
      );

      expect(result.sandboxStatus).toBe(TourSandboxStatus.REJECTED);
      expect(result.sandboxRejectionReason).toBe('Selectors invalides');
      expect(result.sandboxRejectedAt).toEqual(new Date('2026-06-01T10:00:00.000Z'));
      expect(result.sandboxRejectedBy).toBe('admin-id');
    });
  });

  // ─────────────────────────────────────────────
  describe('delete', () => {
    it('should hard-delete a tour', async () => {
      mockTourRepository.findOne.mockResolvedValue({ ...mockTourEntity, steps: [mockStepEntity] });
      mockTourRepository.delete.mockResolvedValue({ affected: 1 });

      await service.delete('tour-uuid-1234', orgId, adminActor);

      expect(mockTourRepository.delete).toHaveBeenCalledWith({
        id: 'tour-uuid-1234',
        organizationId: orgId,
      });
    });

    it('should throw NotFoundException when deleting nonexistent tour', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('nonexistent', orgId, adminActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should forbid developer delete after moderation submission', async () => {
      mockTourRepository.findOne.mockResolvedValue({
        ...mockTourEntity,
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.RETURNED,
        assignedAdminIds: ['admin-id'],
        assignedToAdminsAt: new Date('2026-06-05T10:00:00.000Z'),
        sandboxRejectedBy: 'admin-id',
        steps: [mockStepEntity],
      });

      await expect(service.delete('tour-uuid-1234', orgId, developerActor)).rejects.toThrow(
        'Ce parcours a été soumis à la modération',
      );
      expect(mockTourRepository.delete).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  describe('toggleActive', () => {
    it('should activate an inactive tour', async () => {
      const inactiveTour = { ...mockTourEntity, isActive: false, steps: [mockStepEntity] };

      mockTourRepository.findOne.mockResolvedValue(inactiveTour);
      mockTourRepository.save.mockResolvedValue({ ...inactiveTour, isActive: true });

      const result = await service.toggleActive('tour-uuid-1234', orgId, true, adminActor);

      expect(result.isActive).toBe(true);
    });

    it('should deactivate an active tour', async () => {
      const activeTour = { ...mockTourEntity, isActive: true, steps: [mockStepEntity] };

      mockTourRepository.findOne.mockResolvedValue(activeTour);
      mockTourRepository.save.mockResolvedValue({ ...activeTour, isActive: false });

      const result = await service.toggleActive('tour-uuid-1234', orgId, false, adminActor);

      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException when toggling nonexistent tour', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(
        service.toggleActive('nonexistent', orgId, true, adminActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('clears sandbox user states when sandbox test is deactivated on production tour', async () => {
      const tour = {
        ...mockTourEntity,
        environment: TourEnvironment.PRODUCTION,
        isSandboxTestActive: true,
        sandboxTestStartedBy: userId,
        isActive: false,
        steps: [mockStepEntity],
      };

      mockTourRepository.findOne.mockResolvedValue(tour);
      mockTourRepository.save.mockResolvedValue({ ...tour, isSandboxTestActive: false });
      mockTourUserStateRepository.delete.mockResolvedValue({ affected: 1 });

      await service.toggleActive('tour-uuid-1234', orgId, false, adminActor, 'sandbox');

      expect(mockTourUserStateRepository.delete).toHaveBeenCalledWith({
        tourId: 'tour-uuid-1234',
        organizationId: orgId,
        environment: TourEnvironment.SANDBOX,
      });
      expect(mockTourRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isSandboxTestActive: false,
          sandboxTestStartedBy: null,
        }),
      );
    });

    it('should allow developer to activate own sandbox tour for testing', async () => {
      const sandboxTour = {
        ...mockTourEntity,
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        isActive: false,
        steps: [mockStepEntity],
      };

      mockTourRepository.findOne.mockResolvedValue(sandboxTour);
      mockTourRepository.save.mockResolvedValue({ ...sandboxTour, isActive: true });

      const result = await service.toggleActive('tour-uuid-1234', orgId, true, {
        ...developerActor,
        id: userId,
      });

      expect(result.isActive).toBe(true);
      expect(mockTourRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          sandboxTestStartedBy: userId,
        }),
      );
    });
  });

  // ─────────────────────────────────────────────
  describe('findActiveToursForUrl', () => {
    const buildQueryBuilder = (tours: typeof mockTourEntity[]) => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(tours),
    });

    it('should return only production active tours by default', async () => {
      mockTourRepository.createQueryBuilder.mockReturnValue(buildQueryBuilder([mockTourEntity]));

      const result = await service.findActiveToursForUrl('/dashboard/transfers', orgId);

      expect(result).toEqual([mockTourEntity]);
      expect(mockTourRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('should include own sandbox tours for developer runtime context', async () => {
      const sandboxTour = {
        ...mockTourEntity,
        id: 'sandbox-tour-id',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        sandboxTestStartedBy: userId,
      };

      mockTourRepository.createQueryBuilder
        .mockReturnValueOnce(buildQueryBuilder([mockTourEntity]))
        .mockReturnValueOnce(buildQueryBuilder([sandboxTour]))
        .mockReturnValueOnce(buildQueryBuilder([]));

      const result = await service.findActiveToursForUrl('/dashboard/transfers', orgId, userId, {
        userId,
        userRole: UserRole.DEVELOPER,
        authMethod: 'jwt',
      });

      expect(result).toEqual([mockTourEntity, sandboxTour]);
      expect(mockTourRepository.createQueryBuilder).toHaveBeenCalledTimes(3);
    });

    it('should not include sandbox tours without sandbox runtime permission', async () => {
      mockTourRepository.createQueryBuilder.mockReturnValue(buildQueryBuilder([mockTourEntity]));

      const result = await service.findActiveToursForUrl('/dashboard/transfers', orgId, userId, {
        userId,
        userRole: UserRole.USER,
        authMethod: 'jwt',
      });

      expect(result).toEqual([mockTourEntity]);
      expect(mockTourRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('should hide sandbox test production tours from non-launcher developer', async () => {
      const approvedTourSandboxTest = {
        ...mockTourEntity,
        id: 'approved-sandbox-test',
        environment: TourEnvironment.PRODUCTION,
        isActive: true,
        isSandboxTestActive: true,
        sandboxStatus: TourSandboxStatus.APPROVED,
        sandboxTestStartedBy: 'admin-id',
      };

      mockTourRepository.createQueryBuilder
        .mockReturnValueOnce(buildQueryBuilder([mockTourEntity]))
        .mockReturnValueOnce(buildQueryBuilder([]))
        .mockReturnValueOnce(buildQueryBuilder([approvedTourSandboxTest]));

      const result = await service.findActiveToursForUrl('/dashboard/transfers', orgId, userId, {
        userId,
        userRole: UserRole.DEVELOPER,
        authMethod: 'jwt',
      });

      expect(result).toEqual([mockTourEntity]);
    });
  });

  describe('publishContextualDrafts', () => {
    it('should reject drafts below scenario thresholds', async () => {
      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.MEDIUM,
        drafts: [
          {
            name: 'Low quality draft',
            targetUrl: '/dashboard/sdk-tests/medium',
            intent: 'primary-action',
            confidence: 40,
            score: 50,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-low' },
            steps: [
              {
                title: 'Step 1',
                content: 'Content 1',
                targetSelector: 'h1:nth-of-type(1)',
              },
              {
                title: 'Step 2',
                content: 'Content 2',
                targetSelector: '',
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([]);
      const createSpy = jest.spyOn(service, 'create');

      const result = await service.publishContextualDrafts(publishDto, orgId, userId);

      expect(result.rejected).toBe(1);
      expect(result.created).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
      expect(result.details[0].reasons.length).toBeGreaterThan(0);
    });

    it('should create and auto-activate a high-quality draft', async () => {
      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.MEDIUM,
        drafts: [
          {
            name: 'KYC validation',
            targetUrl: '/dashboard/sdk-tests/medium',
            intent: 'primary-action',
            confidence: 88,
            score: 91,
            flowVersioning: { flowVersion: 'v2', flowSignature: 'sig-kyc-1' },
            diagnostics: { rejectedNoise: 2 },
            steps: [
              {
                title: 'Open identity form',
                content: 'Use the form to start',
                targetSelector: '[data-tour-id="tour-medium-input-full-name"]',
              },
              {
                title: 'Validate',
                content: 'Click validate to submit',
                targetSelector: '[data-tour-id="tour-medium-validate-identity"] button',
                isPrimary: true,
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([]);
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({ ...mockTourEntity, id: 'new-contextual-tour' } as GuidedTour);

      const result = await service.publishContextualDrafts(publishDto, orgId, userId);

      expect(result.created).toBe(1);
      expect(result.activated).toBe(1);
      expect(result.rejected).toBe(0);
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(mockFaqEntryService.registerProject).not.toHaveBeenCalled();
    });

    it('should register FAQ project for non-lab contextual publish', async () => {
      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.MEDIUM,
        drafts: [
          {
            name: 'CRM onboarding',
            targetUrl: '/app/crm/dashboard',
            intent: 'primary-action',
            confidence: 88,
            score: 91,
            flowVersioning: { flowVersion: 'crm-v2', flowSignature: 'sig-crm-1' },
            diagnostics: { rejectedNoise: 2 },
            steps: [
              {
                title: 'Open form',
                content: 'Use the form to start',
                targetSelector: '[data-tour-id="crm-form"]',
              },
              {
                title: 'Validate',
                content: 'Click validate to submit',
                targetSelector: '[data-tour-id="crm-submit"]',
                isPrimary: true,
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([]);
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ ...mockTourEntity, id: 'new-contextual-tour' } as GuidedTour);

      await service.publishContextualDrafts(publishDto, orgId, userId);

      expect(mockFaqEntryService.registerProject).toHaveBeenCalledWith(orgId, 'crm-v2');
    });

    it('should refresh pending contextual sandbox tour for the same publisher', async () => {
      const existingTour = {
        ...mockTourEntity,
        id: 'existing-contextual-tour',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        developerPrivate: true,
        createdBy: userId,
        targetUrl: '/dashboard/sdk-tests/simple',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: {
            publishedByRole: 'DEVELOPER',
            intent: 'discovery',
            flowSignature: 'sig-duplicate',
            version: 1,
          },
        },
        steps: [
          {
            id: 'step-existing-1',
            tourId: 'existing-contextual-tour',
            orderIndex: 1,
            title: 'Old step',
            content: 'Old content',
          },
        ],
      };

      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Duplicate draft',
            targetUrl: '/dashboard/sdk-tests/simple',
            intent: 'discovery',
            confidence: 82,
            score: 87,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-duplicate' },
            steps: [
              {
                title: 'Step 1',
                content: 'Content 1',
                targetSelector: '[data-tour-id="tour-simple-title"]',
              },
              {
                title: 'Step 2',
                content: 'Content 2',
                targetSelector: '[data-tour-id="tour-simple-cta"] button',
              },
            ],
          },
        ],
      };

      const existingSteps = existingTour.steps;
      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([existingTour]);
      mockTourRepository.save.mockImplementation(async (tour) => tour);
      mockTourRepository.findOneOrFail.mockResolvedValue({
        ...existingTour,
        createdBy: userId,
      } as GuidedTour);
      const createSpy = jest.spyOn(service, 'create');

      const result = await service.publishContextualDrafts(publishDto, orgId, userId, developerActor);

      expect(result.refreshed).toBe(1);
      expect(result.created).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
      expect(result.details[0].outcome).toBe('refreshed');
      expect(mockStepRepository.remove).toHaveBeenCalledWith(existingSteps);
      expect(mockStepRepository.insert).toHaveBeenCalled();
      expect(mockAccessGrantRepository.delete).not.toHaveBeenCalled();
    });

    it('should block developer publish when pending tour is owned by admin', async () => {
      const existingTour = {
        ...mockTourEntity,
        id: 'admin-blueprint-tour',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        createdBy: 'admin-user-id',
        developerPrivate: false,
        targetUrl: '/',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: {
            publishedByRole: 'ADMIN',
            intent: 'primary-action',
            flowSignature: 'sig-chili-blueprint',
            version: 2,
          },
        },
        steps: [],
      };

      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'CHILI POS blueprint',
            targetUrl: '/',
            intent: 'primary-action',
            confidence: 88,
            score: 91,
            flowVersioning: { flowVersion: 'v3', flowSignature: 'sig-chili-blueprint' },
            steps: [
              {
                title: 'Place order',
                content: 'Click place order',
                targetSelector: 'button[data-tour-id="place-order"]',
                isPrimary: true,
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([existingTour]);
      const createSpy = jest.spyOn(service, 'create');

      const result = await service.publishContextualDrafts(publishDto, orgId, userId, developerActor);

      expect(result.blocked).toBe(1);
      expect(result.created).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
      expect(result.details[0].outcome).toBe('blocked');
      expect(result.details[0].reasons).toContain('tour_owned_by_higher_role');
    });

    it('should allow admin takeover over pending developer-owned contextual tour', async () => {
      const existingTour = {
        ...mockTourEntity,
        id: 'dev-blueprint-tour',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        createdBy: 'dev-user-id',
        developerPrivate: true,
        targetUrl: '/',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: {
            publishedByRole: 'DEVELOPER',
            intent: 'primary-action',
            flowSignature: 'sig-chili-blueprint',
            version: 2,
          },
        },
        steps: [],
      };

      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'CHILI POS blueprint',
            targetUrl: '/',
            intent: 'primary-action',
            confidence: 88,
            score: 91,
            flowVersioning: { flowVersion: 'v3', flowSignature: 'sig-chili-blueprint' },
            steps: [
              {
                title: 'Place order',
                content: 'Click place order',
                targetSelector: 'button[data-tour-id="place-order"]',
                isPrimary: true,
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([existingTour]);
      mockTourRepository.save.mockImplementation(async (tour) => tour);
      mockTourRepository.findOneOrFail.mockResolvedValue({
        ...existingTour,
        createdBy: userId,
        developerPrivate: false,
      } as GuidedTour);
      const createSpy = jest.spyOn(service, 'create');

      const result = await service.publishContextualDrafts(publishDto, orgId, userId, adminActor);

      expect(result.takenOver).toBe(1);
      expect(result.created).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
      expect(result.details[0].outcome).toBe('taken_over');
      expect(result.details[0].reasons).toContain('ownership_transferred');
      expect(mockAccessGrantRepository.delete).toHaveBeenCalledWith({ tourId: 'dev-blueprint-tour' });
    });

    it('should block publish when contextual tour is approved or live', async () => {
      const existingTour = {
        ...mockTourEntity,
        id: 'approved-tour',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.APPROVED,
        createdBy: userId,
        targetUrl: '/dashboard/sdk-tests/simple',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: {
            publishedByRole: 'DEVELOPER',
            intent: 'discovery',
            flowSignature: 'sig-approved',
            version: 3,
          },
        },
        steps: [],
      };

      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Approved duplicate',
            targetUrl: '/dashboard/sdk-tests/simple',
            intent: 'discovery',
            confidence: 82,
            score: 87,
            flowVersioning: { flowVersion: 'v4', flowSignature: 'sig-approved' },
            steps: [
              {
                title: 'Step 1',
                content: 'Content 1',
                targetSelector: '[data-tour-id="tour-simple-title"]',
              },
              {
                title: 'Step 2',
                content: 'Content 2',
                targetSelector: '[data-tour-id="tour-simple-cta"] button',
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([existingTour]);
      const createSpy = jest.spyOn(service, 'create');

      const result = await service.publishContextualDrafts(publishDto, orgId, userId, developerActor);

      expect(result.blocked).toBe(1);
      expect(result.created).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
      expect(result.details[0].reasons).toContain('tour_already_approved_or_live');
    });

    it('should refresh returned contextual tour for the same owner without changing moderation state', async () => {
      const existingTour = {
        ...mockTourEntity,
        id: 'returned-contextual-tour',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.RETURNED,
        developerPrivate: true,
        createdBy: userId,
        sandboxRejectionReason: 'Selectors instables',
        targetUrl: '/dashboard/sdk-tests/simple',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: {
            publishedByRole: 'DEVELOPER',
            intent: 'discovery',
            flowSignature: 'sig-returned',
            version: 2,
          },
        },
        steps: [{ id: 'step-1', tourId: 'returned-contextual-tour', orderIndex: 1, title: 'Old', content: 'Old' }],
      };

      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Returned draft',
            targetUrl: '/dashboard/sdk-tests/simple',
            intent: 'discovery',
            confidence: 82,
            score: 87,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-returned' },
            steps: [
              { title: 'Step 1', content: 'Content 1', targetSelector: '[data-tour-id="tour-simple-title"]' },
              { title: 'Step 2', content: 'Content 2', targetSelector: '[data-tour-id="tour-simple-cta"] button' },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([existingTour]);
      mockTourRepository.save.mockImplementation(async (tour) => tour);
      mockTourRepository.findOneOrFail.mockResolvedValue(existingTour as GuidedTour);
      const createSpy = jest.spyOn(service, 'create');

      const result = await service.publishContextualDrafts(publishDto, orgId, userId, developerActor);

      expect(result.refreshed).toBe(1);
      expect(result.created).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
      expect(result.details[0].outcome).toBe('refreshed');
      expect(result.details[0].tourState?.sandboxStatus).toBe(TourSandboxStatus.RETURNED);
      expect(mockTourRepository.save).toHaveBeenCalledWith(
        expect.not.objectContaining({
          sandboxStatus: expect.anything(),
        }),
      );
    });

    it('should block developer refresh when pending tour is assigned to admin moderation', async () => {
      const existingTour = {
        ...mockTourEntity,
        id: 'assigned-pending-tour',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        developerPrivate: true,
        createdBy: userId,
        assignedAdminIds: ['admin-user-id'],
        targetUrl: '/dashboard/sdk-tests/simple',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: {
            publishedByRole: 'DEVELOPER',
            intent: 'discovery',
            flowSignature: 'sig-assigned',
            version: 1,
          },
        },
        steps: [],
      };

      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Assigned pending draft',
            targetUrl: '/dashboard/sdk-tests/simple',
            intent: 'discovery',
            confidence: 82,
            score: 87,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-assigned' },
            steps: [
              { title: 'Step 1', content: 'Content 1', targetSelector: '[data-tour-id="tour-simple-title"]' },
              { title: 'Step 2', content: 'Content 2', targetSelector: '[data-tour-id="tour-simple-cta"] button' },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([existingTour]);
      const createSpy = jest.spyOn(service, 'create');

      const result = await service.publishContextualDrafts(publishDto, orgId, userId, developerActor);

      expect(result.blocked).toBe(1);
      expect(result.refreshed).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
      expect(result.details[0].reasons).toContain('tour_awaiting_admin_moderation');
      expect(result.details[0].tourState?.assignedToModeration).toBe(true);
    });

    it('should create a new contextual tour when only a dashboard copy shares the flow signature', async () => {
      const duplicateCopyTour = {
        ...mockTourEntity,
        id: 'duplicate-copy-tour',
        name: 'Parcours d action principale (copie)',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        developerPrivate: true,
        createdBy: userId,
        assignedAdminIds: ['admin-1'],
        targetUrl: '/',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: {
            publishedByRole: 'DEVELOPER',
            intent: 'primary-action',
            flowSignature: 'sig-place-order',
            version: 1,
          },
        },
        steps: [],
      };

      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Parcours d action principale - Place Order',
            targetUrl: '/',
            intent: 'primary-action',
            confidence: 88,
            score: 91,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-place-order' },
            steps: [
              {
                title: 'Place order',
                content: 'Click place order',
                targetSelector: 'button[data-tour-id="place-order"]',
                isPrimary: true,
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([duplicateCopyTour]);
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({ ...mockTourEntity, id: 'fresh-autogen-tour' } as GuidedTour);

      const result = await service.publishContextualDrafts(
        publishDto,
        orgId,
        userId,
        developerActor,
      );

      expect(result.created).toBe(1);
      expect(result.blocked).toBe(0);
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('should create a separate lab tour for another publisher on the same flow signature', async () => {
      const firstPublisherId = 'dev-user-a';
      const secondPublisherId = 'dev-user-b';
      const existingTour = {
        ...mockTourEntity,
        id: 'lab-tour-user-a',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
        developerPrivate: true,
        createdBy: firstPublisherId,
        targetUrl: '/dashboard/sdk-tests/simple',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: {
            publishedByRole: 'DEVELOPER',
            intent: 'discovery',
            flowSignature: 'sig-shared-lab',
            version: 1,
          },
        },
        steps: [
          {
            id: 'step-a-1',
            tourId: 'lab-tour-user-a',
            orderIndex: 1,
            title: 'Old step',
            content: 'Old content',
          },
        ],
      };

      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Lab tour user B',
            targetUrl: '/dashboard/sdk-tests/simple',
            intent: 'discovery',
            confidence: 88,
            score: 91,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-shared-lab' },
            steps: [
              {
                title: 'Step 1',
                content: 'Content 1',
                targetSelector: '[data-tour-id="tour-simple-title"]',
              },
              {
                title: 'Step 2',
                content: 'Content 2',
                targetSelector: '[data-tour-id="tour-simple-cta"] button',
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([existingTour]);
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({ ...mockTourEntity, id: 'lab-tour-user-b' } as GuidedTour);

      const result = await service.publishContextualDrafts(
        publishDto,
        orgId,
        secondPublisherId,
        { id: secondPublisherId, role: UserRole.DEVELOPER, authMethod: 'jwt' },
      );

      expect(result.created).toBe(1);
      expect(result.blocked).toBe(0);
      expect(result.refreshed).toBe(0);
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('should block former owner after developer transfer on returned tour', async () => {
      const existingTour = {
        ...mockTourEntity,
        id: 'transferred-contextual-tour',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.RETURNED,
        developerPrivate: true,
        createdBy: 'dev-new-owner',
        targetUrl: '/',
        triggerConditions: {
          source: 'contextual-engine',
          contextualEngine: {
            publishedByRole: 'DEVELOPER',
            intent: 'primary-action',
            flowSignature: 'sig-transfer',
            version: 1,
          },
        },
        steps: [],
      };

      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Transferred tour draft',
            targetUrl: '/',
            intent: 'primary-action',
            confidence: 88,
            score: 91,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-transfer' },
            steps: [
              {
                title: 'Place order',
                content: 'Click place order',
                targetSelector: 'button[data-tour-id="place-order"]',
                isPrimary: true,
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([existingTour]);
      const createSpy = jest.spyOn(service, 'create');

      const result = await service.publishContextualDrafts(
        publishDto,
        orgId,
        userId,
        developerActor,
      );

      expect(result.blocked).toBe(1);
      expect(result.created).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
      expect(result.details[0].reasons).toContain('tour_owned_by_another_publisher');
      expect(result.details[0].tourState?.createdBy).toBe('dev-new-owner');
    });

    it('should create contextual drafts in sandbox when published via SDK integration token', async () => {
      const publishDto: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Client app autogen',
            targetUrl: '/',
            intent: 'discovery',
            confidence: 88,
            score: 91,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-sdk-token' },
            steps: [
              {
                title: 'Step 1',
                content: 'Content 1',
                targetSelector: '[data-tour-id="hero"]',
              },
              {
                title: 'Step 2',
                content: 'Content 2',
                targetSelector: '[data-tour-id="cta"] button',
              },
            ],
          },
        ],
      };

      mockOrganizationService.findById.mockResolvedValue({ id: orgId });
      mockTourRepository.find.mockResolvedValue([]);
      mockTourRepository.create.mockImplementation((payload) => payload);
      mockTourRepository.save.mockImplementation(async (tour) => ({
        ...tour,
        id: 'sdk-contextual-tour',
      }));
      mockTourRepository.findOneOrFail.mockResolvedValue({
        ...mockTourEntity,
        id: 'sdk-contextual-tour',
        targetUrl: '/',
        environment: TourEnvironment.SANDBOX,
        sandboxStatus: TourSandboxStatus.PENDING,
      });

      const result = await service.publishContextualDrafts(
        publishDto,
        orgId,
        userId,
        sdkTokenActor,
      );

      expect(result.created).toBe(1);
      expect(mockTourRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: TourEnvironment.SANDBOX,
          sandboxStatus: TourSandboxStatus.PENDING,
        }),
      );
    });
  });
});

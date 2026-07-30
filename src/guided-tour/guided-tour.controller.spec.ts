import { Test, TestingModule } from '@nestjs/testing';
import { GuidedTourController } from './guided-tour.controller';
import { GuidedTourService } from './guided-tour.service';
import { NotFoundException } from '@nestjs/common';
import { CreateGuidedTourDto } from './dto/create-guided-tour.dto';
import { UpdateGuidedTourDto } from './dto/update-guided-tour.dto';
import { PositionType, ActionType } from '../step/enums/tour.enums';
import { ContextualScenario, PublishContextualDraftsDto } from './dto/publish-contextual-drafts.dto';

describe('GuidedTourController', () => {
  let controller: GuidedTourController;
  let service: GuidedTourService;

  const mockGuidedTourService = {
    create: jest.fn(),
    publishContextualDrafts: jest.fn(),
    findAllByOrganization: jest.fn(),
    findActiveToursForUrl: jest.fn(),
    findGuideToursForUrl: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    toggleActive: jest.fn(),
    delete: jest.fn(),
  };

  const mockCurrentUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'admin@trustdev.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
    organizationId: 'org-uuid-1234',
  };

  const mockTourResponse = {
    id: 'tour-uuid-1234',
    name: 'Premier virement',
    description: 'Guide pas-à-pas pour effectuer votre premier virement bancaire',
    targetUrl: '/dashboard/transfers',
    isActive: true,
    priority: 10,
    triggerConditions: { minTimeOnPage: 30, requiredElements: ['#transfer-button'] },
    organizationId: 'org-uuid-1234',
    createdBy: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date('2026-02-15T10:30:00.000Z'),
    updatedAt: new Date('2026-02-15T10:30:00.000Z'),
    steps: [
      {
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
      },
    ],
  };

  const mockTourResponse2 = {
    id: 'tour-uuid-5678',
    name: 'Découverte du tableau de bord',
    description: 'Présentation des fonctionnalités principales',
    targetUrl: '/dashboard',
    isActive: false,
    priority: 5,
    triggerConditions: {},
    organizationId: 'org-uuid-1234',
    createdBy: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date('2026-02-16T10:30:00.000Z'),
    updatedAt: new Date('2026-02-16T10:30:00.000Z'),
    steps: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuidedTourController],
      providers: [
        {
          provide: GuidedTourService,
          useValue: mockGuidedTourService,
        },
      ],
    }).compile();

    controller = module.get<GuidedTourController>(GuidedTourController);
    service = module.get<GuidedTourService>(GuidedTourService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should create a guided tour successfully', async () => {
      const createTourDto: CreateGuidedTourDto = {
        name: 'Premier virement',
        description: 'Guide pas-à-pas pour effectuer votre premier virement bancaire',
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
            skipAllowed: true,
            highlightElement: true,
          },
        ],
      };

      mockGuidedTourService.create.mockResolvedValue(mockTourResponse);

      const result = await controller.create(createTourDto, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Tour created successfully',
        tour: mockTourResponse,
      });
      expect(service.create).toHaveBeenCalledWith(
        createTourDto,
        mockCurrentUser.organizationId,
        mockCurrentUser.id,
      );
    });

    it('should create a tour with minimal fields', async () => {
      const createTourDto: CreateGuidedTourDto = {
        name: 'Tour minimal',
        targetUrl: '/page',
        steps: [
          { title: 'Étape 1', content: 'Contenu' },
        ],
      };

      mockGuidedTourService.create.mockResolvedValue({
        ...mockTourResponse,
        name: 'Tour minimal',
      });

      const result = await controller.create(createTourDto, mockCurrentUser);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Tour created successfully');
    });

    it('should use organizations array fallback if organizationId is null', async () => {
      const userWithOrgsArray = {
        ...mockCurrentUser,
        organizationId: null,
        organizations: [{ id: 'org-from-array' }],
      };

      const createTourDto: CreateGuidedTourDto = {
        name: 'Test',
        targetUrl: '/test',
        steps: [{ title: 'Étape', content: 'Contenu' }],
      };

      mockGuidedTourService.create.mockResolvedValue(mockTourResponse);

      await controller.create(createTourDto, userWithOrgsArray);

      expect(service.create).toHaveBeenCalledWith(
        createTourDto,
        'org-from-array',
        userWithOrgsArray.id,
      );
    });
  });

  // ─────────────────────────────────────────────
  describe('findAll', () => {
    it('should return all tours for the organization', async () => {
      const tours = [mockTourResponse, mockTourResponse2];
      mockGuidedTourService.findAllByOrganization.mockResolvedValue(tours);

      const result = await controller.findAll(mockCurrentUser, undefined);

      expect(result).toEqual({
        success: true,
        count: 2,
        tours,
      });
      expect(service.findAllByOrganization).toHaveBeenCalledWith(
        mockCurrentUser.organizationId,
        mockCurrentUser,
        undefined,
        true,
        undefined,
      );
    });

    it('should filter by isActive when provided', async () => {
      mockGuidedTourService.findAllByOrganization.mockResolvedValue([mockTourResponse]);

      const result = await controller.findAll(mockCurrentUser, true);

      expect(result.count).toBe(1);
      expect(service.findAllByOrganization).toHaveBeenCalledWith(
        mockCurrentUser.organizationId,
        mockCurrentUser,
        true,
        true,
        undefined,
      );
    });

    it('should filter by flowVersion when provided', async () => {
      mockGuidedTourService.findAllByOrganization.mockResolvedValue([mockTourResponse]);

      const result = await controller.findAll(mockCurrentUser, undefined, undefined, 'test-11-v1');

      expect(result.count).toBe(1);
      expect(service.findAllByOrganization).toHaveBeenCalledWith(
        mockCurrentUser.organizationId,
        mockCurrentUser,
        undefined,
        true,
        'test-11-v1',
      );
    });

    it('should return empty array when no tours exist', async () => {
      mockGuidedTourService.findAllByOrganization.mockResolvedValue([]);

      const result = await controller.findAll(mockCurrentUser, undefined);

      expect(result).toEqual({
        success: true,
        count: 0,
        tours: [],
      });
    });
  });

  describe('publishContextualDrafts', () => {
    it('should publish contextual drafts and return processing report', async () => {
      const payload: PublishContextualDraftsDto = {
        scenario: ContextualScenario.SIMPLE,
        drafts: [
          {
            name: 'Simple discovery',
            targetUrl: '/dashboard/sdk-tests/simple',
            confidence: 80,
            score: 82,
            flowVersioning: { flowVersion: 'v1', flowSignature: 'sig-simple-1' },
            steps: [
              {
                title: 'Step 1',
                content: 'Content',
                targetSelector: '[data-tour-id="tour-simple-title"]',
              },
              {
                title: 'Step 2',
                content: 'Content',
                targetSelector: '[data-tour-id="tour-simple-cta"]',
              },
            ],
          },
        ],
      };

      const report = {
        processed: 1,
        created: 1,
        activated: 1,
        rejected: 0,
        skipped: 0,
        details: [{ draftName: 'Simple discovery', outcome: 'activated', reasons: ['auto_activated'] }],
      };
      mockGuidedTourService.publishContextualDrafts.mockResolvedValue(report);

      const res = { status: jest.fn() };
      const result = await controller.publishContextualDrafts(payload, mockCurrentUser, res);

      expect(result).toEqual({
        success: true,
        message: 'Contextual drafts processed successfully',
        report,
      });
      expect(res.status).not.toHaveBeenCalled();
      expect(service.publishContextualDrafts).toHaveBeenCalledWith(
        payload,
        mockCurrentUser.organizationId,
        mockCurrentUser.id,
        mockCurrentUser,
      );
    });
  });

  // ─────────────────────────────────────────────
  describe('findActiveForUrl', () => {
    it('should return active tours for a given URL', async () => {
      mockGuidedTourService.findActiveToursForUrl.mockResolvedValue([mockTourResponse]);

      const result = await controller.findActiveForUrl('/dashboard/transfers', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        count: 1,
        tours: [mockTourResponse],
      });
      expect(service.findActiveToursForUrl).toHaveBeenCalledWith(
        '/dashboard/transfers',
        mockCurrentUser.organizationId,
      );
    });

    it('should return empty array when no active tours match the URL', async () => {
      mockGuidedTourService.findActiveToursForUrl.mockResolvedValue([]);

      const result = await controller.findActiveForUrl('/nonexistent', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        count: 0,
        tours: [],
      });
    });
  });

  describe('findGuidesForUrl', () => {
    it('should return curated guide tours for a given URL', async () => {
      mockGuidedTourService.findGuideToursForUrl.mockResolvedValue([mockTourResponse]);

      const result = await controller.findGuidesForUrl('/dashboard/transfers', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        count: 1,
        tours: [mockTourResponse],
      });
      expect(service.findGuideToursForUrl).toHaveBeenCalledWith(
        '/dashboard/transfers',
        mockCurrentUser.organizationId,
        mockCurrentUser.id,
        {
          userId: mockCurrentUser.id,
          userRole: mockCurrentUser.role,
          authMethod: mockCurrentUser.authMethod,
          scopes: mockCurrentUser.scopes,
        },
      );
    });
  });

  // ─────────────────────────────────────────────
  describe('findById', () => {
    it('should return a tour by ID', async () => {
      mockGuidedTourService.findById.mockResolvedValue(mockTourResponse);

      const result = await controller.findById('tour-uuid-1234', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        tour: mockTourResponse,
      });
      expect(service.findById).toHaveBeenCalledWith(
        'tour-uuid-1234',
        mockCurrentUser.organizationId,
      );
    });

    it('should throw NotFoundException when tour does not exist', async () => {
      mockGuidedTourService.findById.mockRejectedValue(
        new NotFoundException('Parcours introuvable ou vous n\'avez pas les permissions'),
      );

      await expect(
        controller.findById('nonexistent-id', mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('update', () => {
    it('should update a tour successfully', async () => {
      const updateTourDto: UpdateGuidedTourDto = {
        name: 'Premier virement (modifié)',
        priority: 20,
      };

      const updatedTour = {
        ...mockTourResponse,
        name: 'Premier virement (modifié)',
        priority: 20,
      };

      mockGuidedTourService.update.mockResolvedValue(updatedTour);

      const result = await controller.update('tour-uuid-1234', updateTourDto, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Tour updated successfully',
        tour: updatedTour,
      });
      expect(service.update).toHaveBeenCalledWith(
        'tour-uuid-1234',
        updateTourDto,
        mockCurrentUser.organizationId,
      );
    });

    it('should throw NotFoundException when updating a nonexistent tour', async () => {
      const updateTourDto: UpdateGuidedTourDto = { name: 'Updated' };

      mockGuidedTourService.update.mockRejectedValue(
        new NotFoundException('Parcours introuvable ou vous n\'avez pas les permissions'),
      );

      await expect(
        controller.update('nonexistent-id', updateTourDto, mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('toggleActive', () => {
    it('should activate a tour', async () => {
      const activatedTour = { ...mockTourResponse, isActive: true };
      mockGuidedTourService.toggleActive.mockResolvedValue(activatedTour);

      const result = await controller.toggleActive('tour-uuid-1234', true, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Tour activated',
        tour: activatedTour,
      });
      expect(service.toggleActive).toHaveBeenCalledWith(
        'tour-uuid-1234',
        mockCurrentUser.organizationId,
        true,
      );
    });

    it('should deactivate a tour', async () => {
      const deactivatedTour = { ...mockTourResponse, isActive: false };
      mockGuidedTourService.toggleActive.mockResolvedValue(deactivatedTour);

      const result = await controller.toggleActive('tour-uuid-1234', false, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Tour deactivated',
        tour: deactivatedTour,
      });
    });

    it('should throw NotFoundException when toggling a nonexistent tour', async () => {
      mockGuidedTourService.toggleActive.mockRejectedValue(
        new NotFoundException('Parcours introuvable ou vous n\'avez pas les permissions'),
      );

      await expect(
        controller.toggleActive('nonexistent-id', true, mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('delete', () => {
    it('should delete a tour successfully', async () => {
      mockGuidedTourService.delete.mockResolvedValue(undefined);

      const result = await controller.delete('tour-uuid-1234', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Tour deleted successfully',
      });
      expect(service.delete).toHaveBeenCalledWith(
        'tour-uuid-1234',
        mockCurrentUser.organizationId,
      );
    });

    it('should throw NotFoundException when deleting a nonexistent tour', async () => {
      mockGuidedTourService.delete.mockRejectedValue(
        new NotFoundException('Parcours introuvable ou vous n\'avez pas les permissions'),
      );

      await expect(
        controller.delete('nonexistent-id', mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

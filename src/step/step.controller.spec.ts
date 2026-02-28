import { Test, TestingModule } from '@nestjs/testing';
import { StepController } from './step.controller';
import { StepService } from './step.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';
import { PositionType, ActionType } from './enums/tour.enums';

describe('StepController', () => {
  let controller: StepController;
  let service: StepService;

  const mockStepService = {
    create: jest.fn(),
    findAllByTour: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn(),
    moveUp: jest.fn(),
    moveDown: jest.fn(),
    duplicate: jest.fn(),
  };

  const mockCurrentUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'admin@trustdev.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
    organizationId: 'org-uuid-1234',
  };

  const tourId = 'tour-uuid-1234';

  const mockStepResponse = {
    id: 'step-uuid-1',
    tourId,
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

  const mockStepResponse2 = {
    id: 'step-uuid-2',
    tourId,
    orderIndex: 2,
    title: 'Saisissez le montant',
    content: 'Entrez le montant du virement',
    targetSelector: '#amount-input',
    position: PositionType.RIGHT,
    action: ActionType.NEXT,
    skipAllowed: false,
    highlightElement: true,
    createdAt: new Date('2026-02-15T10:35:00.000Z'),
    updatedAt: new Date('2026-02-15T10:35:00.000Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StepController],
      providers: [
        {
          provide: StepService,
          useValue: mockStepService,
        },
      ],
    }).compile();

    controller = module.get<StepController>(StepController);
    service = module.get<StepService>(StepService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should create a step in a tour', async () => {
      const createStepDto: CreateStepDto = {
        title: 'Bienvenue !',
        content: 'Cliquez ici pour commencer',
        targetSelector: '#transfer-button',
        position: PositionType.BOTTOM,
        action: ActionType.CLICK,
        skipAllowed: true,
        highlightElement: true,
      };

      mockStepService.create.mockResolvedValue(mockStepResponse);

      const result = await controller.create(tourId, createStepDto, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Étape ajoutée avec succès',
        step: mockStepResponse,
      });
      expect(service.create).toHaveBeenCalledWith(
        createStepDto,
        tourId,
        mockCurrentUser.organizationId,
      );
    });

    it('should create a step with minimal fields', async () => {
      const createStepDto: CreateStepDto = {
        title: 'Étape simple',
        content: 'Contenu simple',
      };

      mockStepService.create.mockResolvedValue({ ...mockStepResponse, ...createStepDto });

      const result = await controller.create(tourId, createStepDto, mockCurrentUser);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Étape ajoutée avec succès');
    });

    it('should throw NotFoundException when tour does not exist', async () => {
      const createStepDto: CreateStepDto = {
        title: 'Étape',
        content: 'Contenu',
      };

      mockStepService.create.mockRejectedValue(
        new NotFoundException('Parcours introuvable ou vous n\'avez pas les permissions'),
      );

      await expect(
        controller.create('bad-tour-id', createStepDto, mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('findAllByTour', () => {
    it('should return all steps for a tour', async () => {
      const steps = [mockStepResponse, mockStepResponse2];
      mockStepService.findAllByTour.mockResolvedValue(steps);

      const result = await controller.findAllByTour(tourId, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        count: 2,
        steps,
      });
      expect(service.findAllByTour).toHaveBeenCalledWith(
        tourId,
        mockCurrentUser.organizationId,
      );
    });

    it('should return empty array when tour has no steps', async () => {
      mockStepService.findAllByTour.mockResolvedValue([]);

      const result = await controller.findAllByTour(tourId, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        count: 0,
        steps: [],
      });
    });

    it('should throw NotFoundException when tour does not exist', async () => {
      mockStepService.findAllByTour.mockRejectedValue(
        new NotFoundException('Parcours introuvable ou vous n\'avez pas les permissions'),
      );

      await expect(
        controller.findAllByTour('bad-tour-id', mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('findById', () => {
    it('should return a step by ID', async () => {
      mockStepService.findById.mockResolvedValue(mockStepResponse);

      const result = await controller.findById('step-uuid-1', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        step: mockStepResponse,
      });
      expect(service.findById).toHaveBeenCalledWith(
        'step-uuid-1',
        mockCurrentUser.organizationId,
      );
    });

    it('should throw NotFoundException when step does not exist', async () => {
      mockStepService.findById.mockRejectedValue(
        new NotFoundException('Étape introuvable'),
      );

      await expect(
        controller.findById('nonexistent', mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('update', () => {
    it('should update a step successfully', async () => {
      const updateStepDto: UpdateStepDto = {
        title: 'Bienvenue (modifié) !',
        position: PositionType.TOP,
      };

      const updatedStep = {
        ...mockStepResponse,
        title: 'Bienvenue (modifié) !',
        position: PositionType.TOP,
      };

      mockStepService.update.mockResolvedValue(updatedStep);

      const result = await controller.update('step-uuid-1', updateStepDto, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Étape mise à jour avec succès',
        step: updatedStep,
      });
      expect(service.update).toHaveBeenCalledWith(
        'step-uuid-1',
        updateStepDto,
        mockCurrentUser.organizationId,
      );
    });

    it('should throw NotFoundException when updating nonexistent step', async () => {
      mockStepService.update.mockRejectedValue(
        new NotFoundException('Étape introuvable'),
      );

      await expect(
        controller.update('nonexistent', { title: 'x' }, mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('delete', () => {
    it('should delete a step successfully', async () => {
      mockStepService.delete.mockResolvedValue(undefined);

      const result = await controller.delete('step-uuid-1', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Étape supprimée avec succès',
      });
      expect(service.delete).toHaveBeenCalledWith(
        'step-uuid-1',
        mockCurrentUser.organizationId,
      );
    });

    it('should throw NotFoundException when deleting nonexistent step', async () => {
      mockStepService.delete.mockRejectedValue(
        new NotFoundException('Étape introuvable'),
      );

      await expect(
        controller.delete('nonexistent', mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('reorder', () => {
    it('should reorder steps successfully', async () => {
      const reorderedSteps = [
        { ...mockStepResponse2, orderIndex: 1 },
        { ...mockStepResponse, orderIndex: 2 },
      ];

      mockStepService.reorder.mockResolvedValue(reorderedSteps);

      const stepIds = ['step-uuid-2', 'step-uuid-1'];
      const result = await controller.reorder(tourId, stepIds, mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Étapes réorganisées avec succès',
        steps: reorderedSteps,
      });
      expect(service.reorder).toHaveBeenCalledWith(
        tourId,
        stepIds,
        mockCurrentUser.organizationId,
      );
    });

    it('should throw BadRequestException for invalid step IDs', async () => {
      mockStepService.reorder.mockRejectedValue(
        new BadRequestException('Étapes introuvables : bad-id'),
      );

      await expect(
        controller.reorder(tourId, ['bad-id'], mockCurrentUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when tour does not exist', async () => {
      mockStepService.reorder.mockRejectedValue(
        new NotFoundException('Parcours introuvable ou vous n\'avez pas les permissions'),
      );

      await expect(
        controller.reorder('bad-tour', ['step-id'], mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('moveUp', () => {
    it('should move a step up successfully', async () => {
      const reorderedSteps = [
        { ...mockStepResponse2, orderIndex: 1 },
        { ...mockStepResponse, orderIndex: 2 },
      ];

      mockStepService.moveUp.mockResolvedValue(reorderedSteps);

      const result = await controller.moveUp('step-uuid-2', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Étape déplacée vers le haut',
        steps: reorderedSteps,
      });
      expect(service.moveUp).toHaveBeenCalledWith(
        'step-uuid-2',
        mockCurrentUser.organizationId,
      );
    });

    it('should throw BadRequestException when step is already first', async () => {
      mockStepService.moveUp.mockRejectedValue(
        new BadRequestException('L\'étape est déjà en première position'),
      );

      await expect(
        controller.moveUp('step-uuid-1', mockCurrentUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────
  describe('moveDown', () => {
    it('should move a step down successfully', async () => {
      const reorderedSteps = [
        { ...mockStepResponse2, orderIndex: 1 },
        { ...mockStepResponse, orderIndex: 2 },
      ];

      mockStepService.moveDown.mockResolvedValue(reorderedSteps);

      const result = await controller.moveDown('step-uuid-1', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Étape déplacée vers le bas',
        steps: reorderedSteps,
      });
      expect(service.moveDown).toHaveBeenCalledWith(
        'step-uuid-1',
        mockCurrentUser.organizationId,
      );
    });

    it('should throw BadRequestException when step is already last', async () => {
      mockStepService.moveDown.mockRejectedValue(
        new BadRequestException('L\'étape est déjà en dernière position'),
      );

      await expect(
        controller.moveDown('step-uuid-2', mockCurrentUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────
  describe('duplicate', () => {
    it('should duplicate a step successfully', async () => {
      const duplicatedStep = {
        ...mockStepResponse,
        id: 'step-uuid-new',
        orderIndex: 2,
        title: 'Bienvenue ! (copie)',
      };

      mockStepService.duplicate.mockResolvedValue(duplicatedStep);

      const result = await controller.duplicate('step-uuid-1', mockCurrentUser);

      expect(result).toEqual({
        success: true,
        message: 'Étape dupliquée avec succès',
        step: duplicatedStep,
      });
      expect(service.duplicate).toHaveBeenCalledWith(
        'step-uuid-1',
        mockCurrentUser.organizationId,
      );
    });

    it('should throw NotFoundException when duplicating nonexistent step', async () => {
      mockStepService.duplicate.mockRejectedValue(
        new NotFoundException('Étape introuvable'),
      );

      await expect(
        controller.duplicate('nonexistent', mockCurrentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

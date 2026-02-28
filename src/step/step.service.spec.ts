import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StepService } from './step.service';
import { Step } from './entities/step.entity';
import { GuidedTour } from '../guided-tour/entities/guided-tour.entity';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';
import { PositionType, ActionType } from './enums/tour.enums';

describe('StepService', () => {
  let service: StepService;

  const mockStepRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };

  const mockTourRepository = {
    findOne: jest.fn(),
  };

  const mockDataSource = {
    query: jest.fn(),
  };

  const orgId = 'org-uuid-1234';
  const tourId = 'tour-uuid-1234';

  const mockTourEntity = {
    id: tourId,
    name: 'Premier virement',
    organizationId: orgId,
    steps: [],
  };

  const mockStepEntity = {
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
    tour: { id: tourId, organizationId: orgId },
    createdAt: new Date('2026-02-15T10:30:00.000Z'),
    updatedAt: new Date('2026-02-15T10:30:00.000Z'),
  };

  const mockStepEntity2 = {
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
    tour: { id: tourId, organizationId: orgId },
    createdAt: new Date('2026-02-15T10:35:00.000Z'),
    updatedAt: new Date('2026-02-15T10:35:00.000Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StepService,
        {
          provide: getRepositoryToken(Step),
          useValue: mockStepRepository,
        },
        {
          provide: getRepositoryToken(GuidedTour),
          useValue: mockTourRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<StepService>(StepService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should create a step at the end of the tour', async () => {
      const createStepDto: CreateStepDto = {
        title: 'Nouvelle étape',
        content: 'Contenu de la nouvelle étape',
        targetSelector: '#btn',
        position: PositionType.BOTTOM,
        action: ActionType.CLICK,
      };

      const tourWithSteps = {
        ...mockTourEntity,
        steps: [{ orderIndex: 1 }, { orderIndex: 2 }],
      };

      mockTourRepository.findOne.mockResolvedValue(tourWithSteps);
      mockStepRepository.create.mockReturnValue({ ...createStepDto, tourId, orderIndex: 3 });
      mockStepRepository.save.mockResolvedValue({ id: 'step-new', ...createStepDto, tourId, orderIndex: 3 });

      const result = await service.create(createStepDto, tourId, orgId);

      expect(result.orderIndex).toBe(3);
      expect(mockStepRepository.create).toHaveBeenCalledWith({
        ...createStepDto,
        tourId,
        orderIndex: 3,
      });
    });

    it('should create a step with orderIndex 1 when tour has no steps', async () => {
      const createStepDto: CreateStepDto = {
        title: 'Première étape',
        content: 'Contenu',
      };

      const emptyTour = { ...mockTourEntity, steps: [] };

      mockTourRepository.findOne.mockResolvedValue(emptyTour);
      mockStepRepository.create.mockReturnValue({ ...createStepDto, tourId, orderIndex: 1 });
      mockStepRepository.save.mockResolvedValue({ id: 'step-new', ...createStepDto, tourId, orderIndex: 1 });

      const result = await service.create(createStepDto, tourId, orgId);

      expect(result.orderIndex).toBe(1);
    });

    it('should throw NotFoundException when tour does not exist', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create({ title: 'Test', content: 'Test' }, 'bad-id', orgId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when tour belongs to another org', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create({ title: 'Test', content: 'Test' }, tourId, 'other-org'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('findAllByTour', () => {
    it('should return all steps ordered by orderIndex ASC', async () => {
      mockTourRepository.findOne.mockResolvedValue(mockTourEntity);
      mockStepRepository.find.mockResolvedValue([mockStepEntity, mockStepEntity2]);

      const result = await service.findAllByTour(tourId, orgId);

      expect(result).toEqual([mockStepEntity, mockStepEntity2]);
      expect(mockStepRepository.find).toHaveBeenCalledWith({
        where: { tourId },
        order: { orderIndex: 'ASC' },
      });
    });

    it('should return empty array when tour has no steps', async () => {
      mockTourRepository.findOne.mockResolvedValue(mockTourEntity);
      mockStepRepository.find.mockResolvedValue([]);

      const result = await service.findAllByTour(tourId, orgId);

      expect(result).toEqual([]);
    });

    it('should throw NotFoundException when tour does not exist', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findAllByTour('bad-id', orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('findById', () => {
    it('should return a step by ID', async () => {
      mockStepRepository.findOne.mockResolvedValue(mockStepEntity);

      const result = await service.findById('step-uuid-1', orgId);

      expect(result).toEqual(mockStepEntity);
      expect(mockStepRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'step-uuid-1' },
        relations: ['tour'],
      });
    });

    it('should throw NotFoundException when step does not exist', async () => {
      mockStepRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findById('nonexistent', orgId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when step belongs to another org', async () => {
      const stepFromOtherOrg = {
        ...mockStepEntity,
        tour: { id: tourId, organizationId: 'other-org' },
      };

      mockStepRepository.findOne.mockResolvedValue(stepFromOtherOrg);

      await expect(
        service.findById('step-uuid-1', orgId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  describe('update', () => {
    it('should update a step successfully', async () => {
      const updateStepDto: UpdateStepDto = {
        title: 'Titre modifié',
        position: PositionType.TOP,
      };

      mockStepRepository.findOne.mockResolvedValue({ ...mockStepEntity });
      mockStepRepository.save.mockResolvedValue({
        ...mockStepEntity,
        title: 'Titre modifié',
        position: PositionType.TOP,
      });

      const result = await service.update('step-uuid-1', updateStepDto, orgId);

      expect(result.title).toBe('Titre modifié');
      expect(result.position).toBe(PositionType.TOP);
    });

    it('should throw NotFoundException when updating nonexistent step', async () => {
      mockStepRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { title: 'x' }, orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('delete', () => {
    it('should delete a step and reorder remaining steps', async () => {
      mockStepRepository.findOne.mockResolvedValue({ ...mockStepEntity });
      mockStepRepository.remove.mockResolvedValue(mockStepEntity);
      // reorderSteps internals
      mockStepRepository.find.mockResolvedValue([mockStepEntity2]);
      mockDataSource.query.mockResolvedValue(undefined);

      await service.delete('step-uuid-1', orgId);

      expect(mockStepRepository.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'step-uuid-1' }),
      );
      // reorderSteps should have been called (raw SQL queries)
      expect(mockDataSource.query).toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting nonexistent step', async () => {
      mockStepRepository.findOne.mockResolvedValue(null);

      await expect(
        service.delete('nonexistent', orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('reorderSteps (private, tested via delete)', () => {
    it('should reorder remaining steps after deletion', async () => {
      const remainingSteps = [
        { ...mockStepEntity2, id: 'step-3', orderIndex: 3 },
        { ...mockStepEntity2, id: 'step-5', orderIndex: 5 },
      ];

      mockStepRepository.findOne.mockResolvedValue({ ...mockStepEntity });
      mockStepRepository.remove.mockResolvedValue(mockStepEntity);
      mockStepRepository.find
        .mockResolvedValueOnce(remainingSteps) // first call in reorderSteps
        .mockResolvedValueOnce([                // second call in reorderSteps (return)
          { ...remainingSteps[0], orderIndex: 1 },
          { ...remainingSteps[1], orderIndex: 2 },
        ]);
      mockDataSource.query.mockResolvedValue(undefined);

      await service.delete('step-uuid-1', orgId);

      // Should offset, then set sequential indices
      expect(mockDataSource.query).toHaveBeenCalledWith(
        `UPDATE steps SET order_index = order_index + 10000 WHERE tour_id = $1`,
        [tourId],
      );
    });
  });

  // ─────────────────────────────────────────────
  describe('reorder', () => {
    it('should reorder steps according to provided IDs', async () => {
      const stepIds = ['step-uuid-2', 'step-uuid-1'];

      mockTourRepository.findOne.mockResolvedValue(mockTourEntity);
      mockStepRepository.find
        .mockResolvedValueOnce([mockStepEntity, mockStepEntity2]) // existing steps
        .mockResolvedValueOnce([                                    // return after reorder
          { ...mockStepEntity2, orderIndex: 1 },
          { ...mockStepEntity, orderIndex: 2 },
        ]);
      mockDataSource.query.mockResolvedValue(undefined);

      const result = await service.reorder(tourId, stepIds, orgId);

      expect(result[0].orderIndex).toBe(1);
      expect(result[1].orderIndex).toBe(2);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        `UPDATE steps SET order_index = order_index + 10000 WHERE tour_id = $1`,
        [tourId],
      );
    });

    it('should throw NotFoundException when tour does not exist', async () => {
      mockTourRepository.findOne.mockResolvedValue(null);

      await expect(
        service.reorder('bad-id', ['step-1'], orgId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for missing step IDs', async () => {
      mockTourRepository.findOne.mockResolvedValue(mockTourEntity);
      mockStepRepository.find.mockResolvedValue([mockStepEntity]);

      await expect(
        service.reorder(tourId, ['nonexistent-id'], orgId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────
  describe('moveUp', () => {
    it('should swap step with the previous one', async () => {
      // findById returns step with orderIndex 2
      mockStepRepository.findOne
        .mockResolvedValueOnce({ ...mockStepEntity2 })            // findById
        .mockResolvedValueOnce({ ...mockStepEntity });             // previousStep
      mockDataSource.query.mockResolvedValue(undefined);
      // findAllByTour
      mockTourRepository.findOne.mockResolvedValue(mockTourEntity);
      mockStepRepository.find.mockResolvedValue([
        { ...mockStepEntity2, orderIndex: 1 },
        { ...mockStepEntity, orderIndex: 2 },
      ]);

      const result = await service.moveUp('step-uuid-2', orgId);

      expect(result).toHaveLength(2);
      // Three raw SQL queries: set to 0, swap old, swap new
      expect(mockDataSource.query).toHaveBeenCalledTimes(3);
    });

    it('should throw BadRequestException when step is already first', async () => {
      mockStepRepository.findOne.mockResolvedValue({
        ...mockStepEntity,
        orderIndex: 1,
      });

      await expect(
        service.moveUp('step-uuid-1', orgId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when previous step not found', async () => {
      mockStepRepository.findOne
        .mockResolvedValueOnce({ ...mockStepEntity2 })  // findById
        .mockResolvedValueOnce(null);                     // previousStep

      await expect(
        service.moveUp('step-uuid-2', orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('moveDown', () => {
    it('should swap step with the next one', async () => {
      // findById returns step with orderIndex 1
      mockStepRepository.findOne
        .mockResolvedValueOnce({ ...mockStepEntity })              // findById
        .mockResolvedValueOnce({ ...mockStepEntity2 });            // nextStep
      mockStepRepository.count.mockResolvedValue(2);
      mockDataSource.query.mockResolvedValue(undefined);
      // findAllByTour
      mockTourRepository.findOne.mockResolvedValue(mockTourEntity);
      mockStepRepository.find.mockResolvedValue([
        { ...mockStepEntity2, orderIndex: 1 },
        { ...mockStepEntity, orderIndex: 2 },
      ]);

      const result = await service.moveDown('step-uuid-1', orgId);

      expect(result).toHaveLength(2);
      expect(mockDataSource.query).toHaveBeenCalledTimes(3);
    });

    it('should throw BadRequestException when step is already last', async () => {
      mockStepRepository.findOne.mockResolvedValue({
        ...mockStepEntity,
        orderIndex: 2,
      });
      mockStepRepository.count.mockResolvedValue(2);

      await expect(
        service.moveDown('step-uuid-1', orgId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when next step not found', async () => {
      mockStepRepository.findOne
        .mockResolvedValueOnce({ ...mockStepEntity })  // findById
        .mockResolvedValueOnce(null);                    // nextStep
      mockStepRepository.count.mockResolvedValue(3);

      await expect(
        service.moveDown('step-uuid-1', orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  describe('duplicate', () => {
    it('should duplicate a step with " (copie)" suffix', async () => {
      mockStepRepository.findOne.mockResolvedValue({ ...mockStepEntity });

      const duplicated = {
        ...mockStepEntity,
        id: 'step-uuid-new',
        orderIndex: 2,
        title: 'Bienvenue ! (copie)',
      };

      mockStepRepository.create.mockReturnValue(duplicated);
      mockDataSource.query.mockResolvedValue(undefined);
      mockStepRepository.find.mockResolvedValue([]);
      mockStepRepository.save.mockResolvedValue(duplicated);

      const result = await service.duplicate('step-uuid-1', orgId);

      expect(result.title).toBe('Bienvenue ! (copie)');
      expect(result.orderIndex).toBe(2);
      expect(mockStepRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Bienvenue ! (copie)',
          tourId,
          orderIndex: 2,
        }),
      );
    });

    it('should shift subsequent steps via raw SQL', async () => {
      mockStepRepository.findOne.mockResolvedValue({ ...mockStepEntity });
      mockStepRepository.create.mockReturnValue({ id: 'new', orderIndex: 2 });
      mockStepRepository.find.mockResolvedValue([]);
      mockStepRepository.save.mockResolvedValue({ id: 'new', orderIndex: 2 });
      mockDataSource.query.mockResolvedValue(undefined);

      await service.duplicate('step-uuid-1', orgId);

      // Should offset steps after the original
      expect(mockDataSource.query).toHaveBeenCalledWith(
        `UPDATE steps SET order_index = order_index + 10000 WHERE tour_id = $1 AND order_index > $2`,
        [tourId, 1],
      );
    });

    it('should throw NotFoundException when duplicating nonexistent step', async () => {
      mockStepRepository.findOne.mockResolvedValue(null);

      await expect(
        service.duplicate('nonexistent', orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

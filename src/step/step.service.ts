// src/step/step.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Step } from './entities/step.entity';
import { GuidedTour } from '../guided-tour/entities/guided-tour.entity';
import { CreateStepDto } from './dto/create-step.dto';
import { UpdateStepDto } from './dto/update-step.dto';

@Injectable()
export class StepService {
  constructor(
    @InjectRepository(Step)
    private stepRepository: Repository<Step>,
    @InjectRepository(GuidedTour)
    private tourRepository: Repository<GuidedTour>,
    private dataSource: DataSource,
  ) {}

  // ✅ Créer une étape dans un parcours
  async create(
    createStepDto: CreateStepDto,
    tourId: string,
    organizationId: string,
  ): Promise<Step> {
    // Vérifier que le tour existe ET appartient à l'organisation
    const tour = await this.tourRepository.findOne({
      where: { id: tourId, organizationId },
      relations: ['steps'],
    });

    if (!tour) {
      throw new NotFoundException(
        'Parcours introuvable ou vous n\'avez pas les permissions',
      );
    }

    // Déterminer l'orderIndex automatiquement (dernier + 1)
    const maxOrder = tour.steps.length > 0
      ? Math.max(...tour.steps.map((s) => s.orderIndex))
      : 0;

    const step = this.stepRepository.create({
      ...createStepDto,
      tourId,
      orderIndex: maxOrder + 1,
    });

    return this.stepRepository.save(step);
  }

  // ✅ Lister toutes les étapes d'un parcours
  async findAllByTour(tourId: string, organizationId: string): Promise<Step[]> {
    // Vérifier que le tour appartient à l'organisation
    const tour = await this.tourRepository.findOne({
      where: { id: tourId, organizationId },
    });

    if (!tour) {
      throw new NotFoundException(
        'Parcours introuvable ou vous n\'avez pas les permissions',
      );
    }

    return this.stepRepository.find({
      where: { tourId },
      order: { orderIndex: 'ASC' },
    });
  }

  // ✅ Trouver une étape par ID
  async findById(id: string, organizationId: string): Promise<Step> {
    const step = await this.stepRepository.findOne({
      where: { id },
      relations: ['tour'],
    });

    if (!step) {
      throw new NotFoundException('Étape introuvable');
    }

    // Vérifier que l'organisation a accès au parcours parent
    if (step.tour.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Vous n\'avez pas accès à cette étape',
      );
    }

    return step;
  }

  // ✅ Mettre à jour une étape
  async update(
    id: string,
    updateStepDto: UpdateStepDto,
    organizationId: string,
  ): Promise<Step> {
    const step = await this.findById(id, organizationId);

    // Appliquer les modifications
    Object.assign(step, updateStepDto);

    return this.stepRepository.save(step);
  }

  // ✅ Supprimer une étape
  async delete(id: string, organizationId: string): Promise<void> {
    const step = await this.findById(id, organizationId);

    // Supprimer l'étape
    await this.stepRepository.remove(step);

    // Réorganiser les orderIndex des étapes restantes
    await this.reorderSteps(step.tourId);
  }

  // ✅ Réorganiser les étapes d'un parcours
  async reorderSteps(tourId: string): Promise<Step[]> {
    const steps = await this.stepRepository.find({
      where: { tourId },
      order: { orderIndex: 'ASC' },
    });

    // Utiliser une transaction avec des requêtes brutes pour éviter le conflit UNIQUE
    await this.dataSource.query(
      `UPDATE steps SET order_index = order_index + 10000 WHERE tour_id = $1`,
      [tourId],
    );

    for (let i = 0; i < steps.length; i++) {
      await this.dataSource.query(
        `UPDATE steps SET order_index = $1 WHERE id = $2`,
        [i + 1, steps[i].id],
      );
    }

    return this.stepRepository.find({
      where: { tourId },
      order: { orderIndex: 'ASC' },
    });
  }

  // ✅ Réorganiser manuellement les étapes
  async reorder(
    tourId: string,
    stepIds: string[],
    organizationId: string,
  ): Promise<Step[]> {
    // Vérifier que le tour appartient à l'organisation
    const tour = await this.tourRepository.findOne({
      where: { id: tourId, organizationId },
    });

    if (!tour) {
      throw new NotFoundException(
        'Parcours introuvable ou vous n\'avez pas les permissions',
      );
    }

    // Récupérer toutes les étapes du parcours
    const steps = await this.stepRepository.find({
      where: { tourId },
    });

    // Vérifier que tous les IDs fournis existent
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const missingIds = stepIds.filter((id) => !stepMap.has(id));

    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Étapes introuvables : ${missingIds.join(', ')}`,
      );
    }

    // Décaler temporairement pour éviter le conflit UNIQUE
    await this.dataSource.query(
      `UPDATE steps SET order_index = order_index + 10000 WHERE tour_id = $1`,
      [tourId],
    );

    // Réorganiser selon l'ordre fourni
    for (let i = 0; i < stepIds.length; i++) {
      await this.dataSource.query(
        `UPDATE steps SET order_index = $1 WHERE id = $2`,
        [i + 1, stepIds[i]],
      );
    }

    return this.stepRepository.find({
      where: { tourId },
      order: { orderIndex: 'ASC' },
    });
  }

  // ✅ Déplacer une étape vers le haut
  async moveUp(id: string, organizationId: string): Promise<Step[]> {
    const step = await this.findById(id, organizationId);

    if (step.orderIndex === 1) {
      throw new BadRequestException('L\'étape est déjà en première position');
    }

    // Trouver l'étape précédente
    const previousStep = await this.stepRepository.findOne({
      where: {
        tourId: step.tourId,
        orderIndex: step.orderIndex - 1,
      },
    });

    if (!previousStep) {
      throw new NotFoundException('Étape précédente introuvable');
    }

    // Échanger les positions avec valeur temporaire pour éviter le conflit UNIQUE
    const oldOrder = step.orderIndex;
    const newOrder = previousStep.orderIndex;

    await this.dataSource.query(
      `UPDATE steps SET order_index = 0 WHERE id = $1`,
      [step.id],
    );
    await this.dataSource.query(
      `UPDATE steps SET order_index = $1 WHERE id = $2`,
      [oldOrder, previousStep.id],
    );
    await this.dataSource.query(
      `UPDATE steps SET order_index = $1 WHERE id = $2`,
      [newOrder, step.id],
    );

    // Retourner toutes les étapes réorganisées
    return this.findAllByTour(step.tourId, organizationId);
  }

  // ✅ Déplacer une étape vers le bas
  async moveDown(id: string, organizationId: string): Promise<Step[]> {
    const step = await this.findById(id, organizationId);

    // Compter le nombre total d'étapes
    const totalSteps = await this.stepRepository.count({
      where: { tourId: step.tourId },
    });

    if (step.orderIndex === totalSteps) {
      throw new BadRequestException('L\'étape est déjà en dernière position');
    }

    // Trouver l'étape suivante
    const nextStep = await this.stepRepository.findOne({
      where: {
        tourId: step.tourId,
        orderIndex: step.orderIndex + 1,
      },
    });

    if (!nextStep) {
      throw new NotFoundException('Étape suivante introuvable');
    }

    // Échanger les positions avec valeur temporaire pour éviter le conflit UNIQUE
    const oldOrder = step.orderIndex;
    const newOrder = nextStep.orderIndex;

    await this.dataSource.query(
      `UPDATE steps SET order_index = 0 WHERE id = $1`,
      [step.id],
    );
    await this.dataSource.query(
      `UPDATE steps SET order_index = $1 WHERE id = $2`,
      [oldOrder, nextStep.id],
    );
    await this.dataSource.query(
      `UPDATE steps SET order_index = $1 WHERE id = $2`,
      [newOrder, step.id],
    );

    // Retourner toutes les étapes réorganisées
    return this.findAllByTour(step.tourId, organizationId);
  }

  // ✅ Dupliquer une étape
  async duplicate(id: string, organizationId: string): Promise<Step> {
    const originalStep = await this.findById(id, organizationId);

    // Créer une copie
    const duplicatedStep = this.stepRepository.create({
      tourId: originalStep.tourId,
      orderIndex: originalStep.orderIndex + 1,
      title: `${originalStep.title} (copie)`,
      content: originalStep.content,
      targetSelector: originalStep.targetSelector,
      position: originalStep.position,
      action: originalStep.action,
      skipAllowed: originalStep.skipAllowed,
      highlightElement: originalStep.highlightElement,
    });

    // Décaler toutes les étapes suivantes (via raw SQL pour éviter le conflit UNIQUE)
    await this.dataSource.query(
      `UPDATE steps SET order_index = order_index + 10000 WHERE tour_id = $1 AND order_index > $2`,
      [originalStep.tourId, originalStep.orderIndex],
    );
    
    // Récupérer les étapes décalées et les remettre avec +1
    const shiftedSteps = await this.stepRepository.find({
      where: { tourId: originalStep.tourId },
      order: { orderIndex: 'ASC' },
    });
    
    for (const s of shiftedSteps) {
      if (s.orderIndex > 10000) {
        await this.dataSource.query(
          `UPDATE steps SET order_index = $1 WHERE id = $2`,
          [s.orderIndex - 10000 + 1, s.id],
        );
      }
    }

    // Sauvegarder la copie
    return this.stepRepository.save(duplicatedStep);
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { GuidedTour } from './entities/guided-tour.entity';
import { Step } from '../step/entities/step.entity';
import { CreateGuidedTourDto } from './dto/create-guided-tour.dto';
import { UpdateGuidedTourDto } from './dto/update-guided-tour.dto';
import { OrganizationService } from '../organization/organization.service';

@Injectable()
export class GuidedTourService {
  constructor(
    @InjectRepository(GuidedTour)
    private tourRepository: Repository<GuidedTour>,
    @InjectRepository(Step)
    private stepRepository: Repository<Step>,
    private organizationService: OrganizationService,
  ) {}

  // Créer un parcours avec ses étapes
  async create(createTourDto: CreateGuidedTourDto, organizationId: string, createdBy?: string): Promise<GuidedTour> {
    await this.organizationService.findById(organizationId);

    // Extraire les étapes du DTO pour éviter le cascade automatique
    const { steps: stepDtos, ...tourData } = createTourDto;

    // Créer le tour (sans les steps pour éviter cascade avec orderIndex null)
    const tour = this.tourRepository.create({
      ...tourData,
      organizationId,
      createdBy,
      triggerConditions: createTourDto.triggerConditions || {},
    });

    // Sauvegarder le tour pour obtenir l'ID
    const savedTour = await this.tourRepository.save(tour);

    // Créer les étapes avec l'ID du tour et l'orderIndex
    const steps = stepDtos.map((stepDto, index) =>
      this.stepRepository.create({
        ...stepDto,
        tourId: savedTour.id,
        orderIndex: index + 1,
      }),
    );

    // Sauvegarder les étapes
    await this.stepRepository.save(steps);

    // Recharger le tour avec ses étapes
    return this.tourRepository.findOneOrFail({
      where: { id: savedTour.id },
      relations: ['steps'],
    });
  }

  // Lister les parcours d'une organisation
  async findAllByOrganization(organizationId: string, isActive?: boolean): Promise<GuidedTour[]> {
    const query = this.tourRepository
      .createQueryBuilder('tour')
      .leftJoinAndSelect('tour.steps', 'step')
      .where('tour.organization_id = :organizationId', { organizationId })
      .orderBy('tour.is_active', 'DESC')
      .addOrderBy('tour.priority', 'DESC')
      .addOrderBy('tour.createdAt', 'DESC');

    if (isActive !== undefined) {
      query.andWhere('tour.is_active = :isActive', { isActive });
    }

    return query.getMany();
  }

  // Trouver un parcours par ID avec validation d'organisation
  async findById(id: string, organizationId: string): Promise<GuidedTour> {
    const tour = await this.tourRepository.findOne({
      where: { id, organizationId },
      relations: ['steps', 'organization'],
    });

    if (!tour) {
      throw new NotFoundException(`Parcours introuvable ou vous n'avez pas les permissions`);
    }

    // Trier les étapes par ordre
    tour.steps.sort((a, b) => a.orderIndex - b.orderIndex);
    return tour;
  }

  // Mettre à jour un parcours
  async update(id: string, updateTourDto: UpdateGuidedTourDto, organizationId: string): Promise<GuidedTour> {
    const tour = await this.findById(id, organizationId);

    // Mettre à jour les champs simples
    if (updateTourDto.name !== undefined) tour.name = updateTourDto.name;
    if (updateTourDto.description !== undefined) tour.description = updateTourDto.description;
    if (updateTourDto.targetUrl !== undefined) tour.targetUrl = updateTourDto.targetUrl;
    if (updateTourDto.isActive !== undefined) tour.isActive = updateTourDto.isActive;
    if (updateTourDto.priority !== undefined) tour.priority = updateTourDto.priority;
    if (updateTourDto.triggerConditions !== undefined) {
      tour.triggerConditions = { ...tour.triggerConditions, ...updateTourDto.triggerConditions };
    }

    // Sauvegarder le tour mis à jour
    await this.tourRepository.save(tour);

    // Gérer les étapes si fournies
    if (updateTourDto.steps) {
      // Supprimer les anciennes étapes
      await this.stepRepository.delete({ tourId: id });

      // Créer les nouvelles étapes
      const newSteps = updateTourDto.steps.map((stepDto, index) =>
        this.stepRepository.create({
          ...stepDto,
          tourId: id,
          orderIndex: index + 1,
        }),
      );

      await this.stepRepository.save(newSteps);
    }

    return this.findById(id, organizationId);
  }

  // Supprimer un parcours (hard delete)
  async delete(id: string, organizationId: string): Promise<void> {
    const result = await this.tourRepository.delete({ id, organizationId });
    if (!result.affected) {
      throw new NotFoundException(`Parcours introuvable ou vous n'avez pas les permissions`);
    }
  }

  // Activer/désactiver un parcours
  async toggleActive(id: string, organizationId: string, isActive: boolean): Promise<GuidedTour> {
    const tour = await this.findById(id, organizationId);
    tour.isActive = isActive;
    return this.tourRepository.save(tour);
  }

  // Trouver les parcours actifs pour une URL cible
  async findActiveToursForUrl(url: string, organizationId: string): Promise<GuidedTour[]> {
    return this.tourRepository.find({
      where: {
        organizationId,
        targetUrl: url,
        isActive: true,
      },
      relations: ['steps'],
      order: { priority: 'DESC' },
    });
  }
}
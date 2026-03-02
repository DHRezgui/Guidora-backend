import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationResponse } from './types/organization-response.type';
import { User } from '../user/entities/user.entity';
import { OrganizationWithUsers } from './types/organization-with-users.type';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  private sanitizeUser(user: User): Partial<User> {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // Sanitiser plusieurs utilisateurs
  private sanitizeUsers(users: User[]): Partial<User>[] {
    return users.map(user => this.sanitizeUser(user));
  }

  private toOrganizationResponse(org: Organization): OrganizationResponse {
    return {
      id: org.id,
      name: org.name,
      apiKey: org.apiKey,
      plan: org.plan,
      domain: org.domain,
      settings: org.settings,
      maxTours: org.maxTours,
      maxUsers: org.maxUsers,
      isActive: org.isActive,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }

  // Créer une organisation
  async create(createOrganizationDto: CreateOrganizationDto): Promise<OrganizationResponse> {
    // Vérifier si l'apiKey existe déjà
    const existingOrg = await this.organizationRepository.findOne({
      where: { apiKey: createOrganizationDto.apiKey },
    });

    if (existingOrg) {
      throw new HttpException('Cette clé API est déjà utilisée', HttpStatus.CONFLICT);
    }

    const organization = this.organizationRepository.create(createOrganizationDto);
    const savedOrg = await this.organizationRepository.save(organization);

    return this.toOrganizationResponse(savedOrg);
  }

  // Récupérer toutes les organisations
  async findAll(): Promise<OrganizationResponse[]> {
    const organizations = await this.organizationRepository.find({
      order: { createdAt: 'DESC' },
    });

    return organizations.map(org => this.toOrganizationResponse(org));
  }

  // Récupérer une organisation par ID
  async findById(id: string): Promise<OrganizationResponse> {
    const organization = await this.organizationRepository.findOne({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException('Organisation introuvable');
    }

    return this.toOrganizationResponse(organization);
  }

  // Récupérer une organisation par API Key
  async findByApiKey(apiKey: string): Promise<Organization | null> {
    return this.organizationRepository.findOne({ where: { apiKey } });
  }

  // Récupérer une organisation avec ses utilisateurs
  async findByIdWithUsers(id: string): Promise<OrganizationWithUsers> {
    const organization = await this.organizationRepository.findOne({
      where: { id },
      relations: ['users'],
    });

    if (!organization) {
      throw new NotFoundException('Organisation introuvable');
    }

    const sanitizedUsers = this.sanitizeUsers(organization.users || []);

    return {
      id: organization.id,
      name: organization.name,
      apiKey: organization.apiKey,
      plan: organization.plan,
      domain: organization.domain,
      settings: organization.settings,
      maxTours: organization.maxTours,
      maxUsers: organization.maxUsers,
      isActive: organization.isActive,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      userCount: sanitizedUsers.length,
      users: sanitizedUsers,
    };
  }

  // Mettre à jour une organisation
  async update(id: string, updateOrganizationDto: UpdateOrganizationDto): Promise<OrganizationResponse> {
    const organization = await this.organizationRepository.findOne({ where: { id } });

    if (!organization) {
      throw new NotFoundException('Organisation introuvable');
    }

    // Vérifier l'apiKey unique si changement
    if (updateOrganizationDto.apiKey && updateOrganizationDto.apiKey !== organization.apiKey) {
      const existingOrg = await this.organizationRepository.findOne({
        where: { apiKey: updateOrganizationDto.apiKey },
      });

      if (existingOrg) {
        throw new HttpException('Cette clé API est déjà utilisée', HttpStatus.CONFLICT);
      }
    }

    // Appliquer les modifications
    Object.assign(organization, updateOrganizationDto);
    const updatedOrg = await this.organizationRepository.save(organization);

    return this.toOrganizationResponse(updatedOrg);
  }

  // Supprimer une organisation
  async delete(id: string): Promise<void> {
    const organization = await this.organizationRepository.findOne({ where: { id } });

    if (!organization) {
      throw new NotFoundException('Organisation introuvable');
    }

    await this.organizationRepository.remove(organization);
  }

  // Compter le nombre d'utilisateurs ACTIFS dans une organisation
  async countUsers(id: string): Promise<number> {
    const organization = await this.findByIdWithUsers(id);
    // Count only active users
    const activeUsers = organization.users ? organization.users.filter(u => u.isActive) : [];
    return activeUsers.length;
  }

  // Vérifier si une organisation a atteint sa limite d'utilisateurs
  async hasReachedUserLimit(id: string): Promise<boolean> {
    const organization = await this.organizationRepository.findOne({ where: { id } });
    
    if (!organization) {
      throw new NotFoundException('Organisation introuvable');
    }

    const userCount = await this.countUsers(id);
    return userCount >= organization.maxUsers;
  }

  // Supprimer avec désassignation des users
  async deleteWithUsers(id: string): Promise<{ usersAffected: number }> {
    const organization = await this.organizationRepository.findOne({
      where: { id },
      relations: ['users'],
    });

    if (!organization) {
      throw new NotFoundException('Organisation introuvable');
    }

    // Désassigner tous les users
    const usersAffected = organization.users?.length || 0;
    
    // Les users seront automatiquement désassignés grâce à ON DELETE SET NULL dans SQL
    await this.organizationRepository.remove(organization);

    return { usersAffected };
  }

}
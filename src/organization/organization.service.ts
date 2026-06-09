import {
  ConflictException,
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationResponse } from './types/organization-response.type';
import { User } from '../user/entities/user.entity';
import { OrganizationWithUsers } from './types/organization-with-users.type';
import {
  AdminResourceEditLockInfo,
  acquireAdminResourceEditLockAtomic,
  assertAdminResourceDeleteBlockedWhileEditing,
  assertAdminResourceEditLockHeldForSave,
  assertCanAcquireAdminResourceEditLock,
  buildAdminResourceEditLockConflictMessage,
  buildAdminResourceEditLockInfo,
  isAdminResourceEditLockExpired,
  isAdminResourceEditLockHeldBy,
  organizationAdminEditRequiresLock,
  renewAdminResourceEditLockAtomic,
} from '../common/admin-resource-edit-lock.util';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private sanitizeUser(user: User): Partial<User> {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // Sanitiser plusieurs utilisateurs
  private sanitizeUsers(users: User[]): Partial<User>[] {
    return users.map(user => this.sanitizeUser(user));
  }

  private async loadHolderDisplayName(userId?: string | null): Promise<string | undefined> {
    if (!userId) {
      return undefined;
    }
    const holder = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'firstName', 'lastName', 'email'],
    });
    if (!holder) {
      return undefined;
    }
    const name = `${holder.firstName ?? ''} ${holder.lastName ?? ''}`.trim();
    return name || holder.email;
  }

  private async attachEditLockToOrganization(
    org: Organization,
    actorId?: string,
  ): Promise<OrganizationResponse> {
    const required = organizationAdminEditRequiresLock();
    const holderDisplayName = org.editLockedBy
      ? await this.loadHolderDisplayName(org.editLockedBy)
      : undefined;
    const editLock = buildAdminResourceEditLockInfo(
      org,
      required,
      actorId,
      holderDisplayName,
    );
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
      editLock,
    };
  }

  private toOrganizationResponse(org: Organization, actorId?: string): OrganizationResponse {
    const required = organizationAdminEditRequiresLock();
    const editLock = buildAdminResourceEditLockInfo(org, required, actorId);
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
      editLock,
    };
  }

  private async findOrganizationEntityOrThrow(id: string): Promise<Organization> {
    const organization = await this.organizationRepository.findOne({ where: { id } });
    if (!organization) {
      throw new NotFoundException('Organisation introuvable');
    }
    return organization;
  }

  private async assertOrganizationEditLockForMutation(
    organization: Organization,
    actorId?: string,
  ): Promise<void> {
    if (!organizationAdminEditRequiresLock()) {
      return;
    }
    const holderDisplayName = organization.editLockedBy
      ? await this.loadHolderDisplayName(organization.editLockedBy)
      : undefined;
    assertAdminResourceEditLockHeldForSave(
      organization,
      true,
      'organisation',
      actorId,
      holderDisplayName,
    );
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
  async findAll(actorId?: string): Promise<OrganizationResponse[]> {
    const organizations = await this.organizationRepository.find({
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      organizations.map((org) => this.attachEditLockToOrganization(org, actorId)),
    );
  }

  // Récupérer une organisation par ID
  async findById(id: string, actorId?: string): Promise<OrganizationResponse> {
    const organization = await this.organizationRepository.findOne({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException('Organisation introuvable');
    }

    return this.attachEditLockToOrganization(organization, actorId);
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
  async update(
    id: string,
    updateOrganizationDto: UpdateOrganizationDto,
    actorId?: string,
  ): Promise<OrganizationResponse> {
    const organization = await this.findOrganizationEntityOrThrow(id);
    await this.assertOrganizationEditLockForMutation(organization, actorId);

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

    return this.attachEditLockToOrganization(updatedOrg, actorId);
  }

  // Supprimer une organisation
  async delete(id: string, actorId?: string): Promise<void> {
    const organization = await this.findOrganizationEntityOrThrow(id);
    const holderDisplayName = organization.editLockedBy
      ? await this.loadHolderDisplayName(organization.editLockedBy)
      : undefined;
    assertAdminResourceDeleteBlockedWhileEditing(
      organization,
      'organisation',
      actorId,
      holderDisplayName,
    );

    await this.organizationRepository.remove(organization);
  }

  async acquireOrganizationEditLock(
    id: string,
    actorId: string,
  ): Promise<{ organization: OrganizationResponse; editLock: AdminResourceEditLockInfo }> {
    assertCanAcquireAdminResourceEditLock(actorId);
    await this.findOrganizationEntityOrThrow(id);

    const acquireResult = await this.organizationRepository.manager.transaction((manager) =>
      acquireAdminResourceEditLockAtomic(manager, Organization, id, actorId),
    );

    if (acquireResult === 'acquired') {
      const refreshed = await this.findOrganizationEntityOrThrow(id);
      const response = await this.attachEditLockToOrganization(refreshed, actorId);
      return { organization: response, editLock: response.editLock! };
    }

    const locked = await this.findOrganizationEntityOrThrow(id);
    const holderDisplayName = await this.loadHolderDisplayName(locked.editLockedBy!);
    const editLock = buildAdminResourceEditLockInfo(locked, true, actorId, holderDisplayName);
    throw new ConflictException({
      message: buildAdminResourceEditLockConflictMessage('organisation', holderDisplayName),
      editLock,
    });
  }

  async renewOrganizationEditLock(
    id: string,
    actorId: string,
  ): Promise<{ organization: OrganizationResponse; editLock: AdminResourceEditLockInfo }> {
    assertCanAcquireAdminResourceEditLock(actorId);

    const refreshed = await this.organizationRepository.manager.transaction((manager) =>
      renewAdminResourceEditLockAtomic(manager, Organization, id, actorId),
    );

    if (!isAdminResourceEditLockHeldBy(refreshed, actorId)) {
      const holderDisplayName = refreshed.editLockedBy
        ? await this.loadHolderDisplayName(refreshed.editLockedBy)
        : undefined;
      throw new ConflictException({
        message: buildAdminResourceEditLockConflictMessage('organisation', holderDisplayName),
        editLock: buildAdminResourceEditLockInfo(refreshed, true, actorId, holderDisplayName),
      });
    }

    const response = await this.attachEditLockToOrganization(refreshed, actorId);
    return { organization: response, editLock: response.editLock! };
  }

  async releaseOrganizationEditLock(id: string, actorId?: string): Promise<void> {
    const organization = await this.organizationRepository.findOne({ where: { id } });
    if (!organization?.editLockedBy) {
      return;
    }
    if (
      organization.editLockedBy !== actorId &&
      !isAdminResourceEditLockExpired(organization.editLockExpiresAt)
    ) {
      return;
    }
    await this.organizationRepository.save({
      id: organization.id,
      editLockedBy: null,
      editLockedAt: null,
      editLockExpiresAt: null,
    });
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
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UserResponse } from './types/user-response.type';
import { OrganizationService } from '../organization/organization.service';
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
  renewAdminResourceEditLockAtomic,
  userAdminEditRequiresLock,
} from '../common/admin-resource-edit-lock.util';
import {
  assertCanAssignUserRole,
  assertTargetUserInActorScope,
  canManagePlatformAdmins,
  canManageTeamMembers,
  isOrgAdmin,
  isSuperAdmin,
  TEAM_MEMBER_ROLES,
  type MembershipActor,
} from '../common/membership-roles.util';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly organizationService: OrganizationService,
  ) {}


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

  private async attachEditLockToUser(
    user: User,
    actorId?: string,
  ): Promise<UserResponse> {
    const required = userAdminEditRequiresLock(actorId, user.id);
    const holderDisplayName = user.editLockedBy
      ? await this.loadHolderDisplayName(user.editLockedBy)
      : undefined;
    const editLock = buildAdminResourceEditLockInfo(
      user,
      required,
      actorId,
      holderDisplayName,
    );
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      editLock,
    };
  }

  private toUserResponse(user: User, actorId?: string): UserResponse {
    const required = userAdminEditRequiresLock(actorId, user.id);
    const editLock = buildAdminResourceEditLockInfo(user, required, actorId);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      editLock,
    };
  }

  private async findUserEntityOrThrow(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  private async assertUserEditLockForMutation(
    user: User,
    actorId?: string,
  ): Promise<void> {
    if (!userAdminEditRequiresLock(actorId, user.id)) {
      return;
    }
    const holderDisplayName = user.editLockedBy
      ? await this.loadHolderDisplayName(user.editLockedBy)
      : undefined;
    assertAdminResourceEditLockHeldForSave(
      user,
      true,
      'utilisateur',
      actorId,
      holderDisplayName,
    );
  }
  
  async createForActor(
    actor: MembershipActor & { id: string },
    createUserDto: CreateUserDto,
  ): Promise<UserResponse> {
    if (!canManagePlatformAdmins(actor) && !canManageTeamMembers(actor)) {
      throw new ForbiddenException('Accès refusé.');
    }

    const payload: CreateUserDto = { ...createUserDto };

    if (isSuperAdmin(actor.role)) {
      payload.role = UserRole.ADMIN;
      if (!payload.organizationId && !payload.organizationName) {
        throw new HttpException(
          'Une organisation est requise pour le compte administrateur.',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (isOrgAdmin(actor.role)) {
      if (!actor.organizationId) {
        throw new ForbiddenException('Aucune organisation associée à cet administrateur.');
      }
      payload.organizationId = actor.organizationId;
      delete payload.organizationName;
      if (!payload.role) {
        payload.role = UserRole.USER;
      }
    }

    assertCanAssignUserRole(actor, payload.role);

    return this.create(payload);
  }

  // Register et gérer l'assignation 
  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    // Vérifier si l'email existe déjà
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new HttpException('Cet email est déjà utilisé', HttpStatus.CONFLICT);
    }

    let organizationId: string | undefined = createUserDto.organizationId;

    // Si organizationName est fourni, trouver l'organisation par nom
    if (createUserDto.organizationName && !organizationId) {
      const organizations = await this.organizationService.findAll();
      const organization = organizations.find(
        org => org.name.toLowerCase() === createUserDto.organizationName?.toLowerCase()
      );

      if (!organization) {
        throw new HttpException(
          `Organisation "${createUserDto.organizationName}" introuvable`,
          HttpStatus.NOT_FOUND
        );
      }

      organizationId = organization.id;

      // Vérifier si l'organisation a atteint sa limite d'utilisateurs
      const hasReachedLimit = await this.organizationService.hasReachedUserLimit(organizationId);
      if (hasReachedLimit) {
        throw new HttpException(
          'Cette organisation a atteint sa limite d\'utilisateurs',
          HttpStatus.FORBIDDEN
        );
      }
    }

    // Créer le user avec l'organizationId trouvé ou fourni
    const user = this.userRepository.create({
      ...createUserDto,
      organizationId,
    });

    const savedUser = await this.userRepository.save(user);

    return this.toUserResponse(savedUser);
  }

  // Utilisateurs SANS password
  async findAll(actor?: MembershipActor & { id?: string }): Promise<UserResponse[]> {
    const select = [
      'id',
      'email',
      'firstName',
      'lastName',
      'role',
      'organizationId',
      'isActive',
      'emailVerified',
      'createdAt',
      'lastLoginAt',
      'editLockedBy',
      'editLockedAt',
      'editLockExpiresAt',
    ] as const;

    if (isSuperAdmin(actor?.role)) {
      const users = await this.userRepository.find({
        where: { role: UserRole.ADMIN },
        select: [...select],
      });
      return Promise.all(users.map((user) => this.attachEditLockToUser(user, actor?.id)));
    }

    if (canManageTeamMembers(actor)) {
      const users = await this.userRepository.find({
        where: {
          organizationId: actor!.organizationId!,
          role: In([...TEAM_MEMBER_ROLES]),
        },
        select: [...select],
      });
      return Promise.all(users.map((user) => this.attachEditLockToUser(user, actor!.id)));
    }

    throw new ForbiddenException('Accès refusé.');
  }

  // Utilisateur par ID SANS password
  async findById(id: string, actorId?: string): Promise<UserResponse> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'role',
        'organizationId',
        'isActive',
        'emailVerified',
        'createdAt',
        'updatedAt',
        'lastLoginAt',
        'editLockedBy',
        'editLockedAt',
        'editLockExpiresAt',
      ],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return this.attachEditLockToUser(user, actorId);
  }

  // Récupérer par email AVEC password (pour login uniquement)
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  // Récupérer les users d'une organisation sans password
  async findByOrganization(organizationId: string): Promise<UserResponse[]> {
  const users = await this.userRepository.find({
    where: { organizationId },
    select: ['id', 'email', 'firstName', 'lastName', 'role', 'organizationId', 'isActive', 'emailVerified', 'createdAt', 'lastLoginAt', 'updatedAt'],
  });

    return users.map(user => this.toUserResponse(user));
  }

  //  Mettre à jour avec validation et hashage du password
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actor?: MembershipActor & { id: string },
  ): Promise<UserResponse> {
    const user = await this.findUserEntityOrThrow(id);
    if (actor) {
      assertTargetUserInActorScope(actor, user);
      if (updateUserDto.role) {
        assertCanAssignUserRole(actor, updateUserDto.role);
      }
    }
    await this.assertUserEditLockForMutation(user, actor?.id);

    // Vérifier l'email unique si changement
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new HttpException('Cet email est déjà utilisé', HttpStatus.CONFLICT);
      }
    }

    // Si newPassword fourni, le renommer en password
    if (updateUserDto.newPassword) {
      (user as any).password = updateUserDto.newPassword;
    }

    if (updateUserDto.email) user.email = updateUserDto.email;
    if (updateUserDto.firstName !== undefined) user.firstName = updateUserDto.firstName;
    if (updateUserDto.lastName !== undefined) user.lastName = updateUserDto.lastName;
    if (updateUserDto.role) user.role = updateUserDto.role;
    if (updateUserDto.isActive !== undefined) user.isActive = updateUserDto.isActive;
    if (updateUserDto.lastLoginAt !== undefined) user.lastLoginAt = updateUserDto.lastLoginAt;

    const updatedUser = await this.userRepository.save(user);

    return this.attachEditLockToUser(updatedUser, actor?.id);
  }

  // Supprimer avec vérification
  async delete(id: string, actor?: MembershipActor & { id: string }): Promise<void> {
    const user = await this.findUserEntityOrThrow(id);
    if (actor) {
      assertTargetUserInActorScope(actor, user);
    }
    const holderDisplayName = user.editLockedBy
      ? await this.loadHolderDisplayName(user.editLockedBy)
      : undefined;
    assertAdminResourceDeleteBlockedWhileEditing(
      user,
      'utilisateur',
      actor?.id,
      holderDisplayName,
    );

    await this.userRepository.remove(user);
  }

  async acquireUserEditLock(
    id: string,
    actorId: string,
  ): Promise<{ user: UserResponse; editLock: AdminResourceEditLockInfo }> {
    assertCanAcquireAdminResourceEditLock(actorId);
    const user = await this.findUserEntityOrThrow(id);

    if (!userAdminEditRequiresLock(actorId, id)) {
      const editLock = buildAdminResourceEditLockInfo(user, false, actorId);
      return { user: await this.attachEditLockToUser(user, actorId), editLock };
    }

    const acquireResult = await this.userRepository.manager.transaction((manager) =>
      acquireAdminResourceEditLockAtomic(manager, User, id, actorId),
    );

    if (acquireResult === 'acquired') {
      const refreshed = await this.findUserEntityOrThrow(id);
      const response = await this.attachEditLockToUser(refreshed, actorId);
      return { user: response, editLock: response.editLock! };
    }

    const locked = await this.findUserEntityOrThrow(id);
    const holderDisplayName = await this.loadHolderDisplayName(locked.editLockedBy!);
    const editLock = buildAdminResourceEditLockInfo(locked, true, actorId, holderDisplayName);
    throw new ConflictException({
      message: buildAdminResourceEditLockConflictMessage('utilisateur', holderDisplayName),
      editLock,
    });
  }

  async renewUserEditLock(
    id: string,
    actorId: string,
  ): Promise<{ user: UserResponse; editLock: AdminResourceEditLockInfo }> {
    assertCanAcquireAdminResourceEditLock(actorId);

    if (!userAdminEditRequiresLock(actorId, id)) {
      const user = await this.findUserEntityOrThrow(id);
      const editLock = buildAdminResourceEditLockInfo(user, false, actorId);
      return { user: await this.attachEditLockToUser(user, actorId), editLock };
    }

    const refreshed = await this.userRepository.manager.transaction((manager) =>
      renewAdminResourceEditLockAtomic(manager, User, id, actorId),
    );

    if (!isAdminResourceEditLockHeldBy(refreshed, actorId)) {
      const holderDisplayName = refreshed.editLockedBy
        ? await this.loadHolderDisplayName(refreshed.editLockedBy)
        : undefined;
      throw new ConflictException({
        message: buildAdminResourceEditLockConflictMessage('utilisateur', holderDisplayName),
        editLock: buildAdminResourceEditLockInfo(refreshed, true, actorId, holderDisplayName),
      });
    }

    const response = await this.attachEditLockToUser(refreshed, actorId);
    return { user: response, editLock: response.editLock! };
  }

  async releaseUserEditLock(id: string, actorId?: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user?.editLockedBy) {
      return;
    }
    if (
      user.editLockedBy !== actorId &&
      !isAdminResourceEditLockExpired(user.editLockExpiresAt)
    ) {
      return;
    }
    await this.userRepository.save({
      id: user.id,
      editLockedBy: null,
      editLockedAt: null,
      editLockExpiresAt: null,
    });
  }

  //  Valider le password (pour login)
  async validatePassword(userId: string, password: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return user.validatePassword(password);
  }

  //  Login complet
  async login(loginUserDto: LoginUserDto): Promise<UserResponse> {
    const user = await this.findByEmail(loginUserDto.email);

    if (!user) {
      throw new HttpException('Email ou mot de passe incorrect', HttpStatus.UNAUTHORIZED);
    }

    const isPasswordValid = await user.validatePassword(loginUserDto.password);

    if (!isPasswordValid) {
      throw new HttpException('Email ou mot de passe incorrect', HttpStatus.UNAUTHORIZED);
    }

    user.lastLoginAt = new Date();
    user.isActive = true;
    const updatedUser = await this.userRepository.save(user);

    return this.toUserResponse(updatedUser);
  }

  //  Logout - Désactiver l'utilisateur
  async logout(id: string): Promise<UserResponse> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    user.isActive = false;
    const updatedUser = await this.userRepository.save(user);

    return this.toUserResponse(updatedUser);
  }

  // Trouver par rôle SANS password
  async findByRole(role: UserRole): Promise<UserResponse[]> {
    const users = await this.userRepository.find({
      where: { role },
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'organizationId', 'isActive', 'emailVerified', 'createdAt', 'lastLoginAt'],
    });
    return users.map(user => this.toUserResponse(user));
  }

  // Trouver les utilisateurs actifs SANS password
  async findActiveUsers(): Promise<UserResponse[]> {
    const users = await this.userRepository.find({
      where: { isActive: true },
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'organizationId', 'isActive', 'emailVerified', 'createdAt', 'lastLoginAt'],
    });
    return users.map(user => this.toUserResponse(user));
  }



  // Assigner un utilisateur à une organisation
  async assignToOrganization(
    userId: string,
    organizationName: string,
    actor?: MembershipActor & { id: string },
  ): Promise<UserResponse> {
    if (!isSuperAdmin(actor?.role)) {
      throw new ForbiddenException('Seul un super administrateur peut réassigner une organisation.');
    }
    const user = await this.findUserEntityOrThrow(userId);
    await this.assertUserEditLockForMutation(user, actor?.id);

    // Trouver l'organisation par nom
    const organizations = await this.organizationService.findAll();
    const organization = organizations.find(
      org => org.name.toLowerCase() === organizationName.toLowerCase()
    );

    if (!organization) {
      throw new HttpException(
        `Organisation "${organizationName}" introuvable`,
        HttpStatus.NOT_FOUND
      );
    }

    // Vérifier la limite d'utilisateurs
    const hasReachedLimit = await this.organizationService.hasReachedUserLimit(organization.id);
    if (hasReachedLimit) {
      throw new HttpException(
        'Cette organisation a atteint sa limite d\'utilisateurs',
        HttpStatus.FORBIDDEN
      );
    }

    // Assigner
    user.organizationId = organization.id;
    const updatedUser = await this.userRepository.save(user);

    return this.attachEditLockToUser(updatedUser, actor?.id);
  }

  // Désassigner un utilisateur d'une organisation
  async removeFromOrganization(
    userId: string,
    actor?: MembershipActor & { id: string },
  ): Promise<UserResponse> {
    if (!isSuperAdmin(actor?.role)) {
      throw new ForbiddenException('Seul un super administrateur peut retirer une organisation.');
    }
    const user = await this.findUserEntityOrThrow(userId);
    await this.assertUserEditLockForMutation(user, actor?.id);

    if (!user.organizationId) {
      throw new HttpException(
        'Cet utilisateur n\'appartient à aucune organisation',
        HttpStatus.BAD_REQUEST
      );
    }

    // Désassigner
    user.organizationId = null;
    const updatedUser = await this.userRepository.save(user);

    return this.attachEditLockToUser(updatedUser, actor?.id);
  }

  // Désassigner tous les users d'une organisation (utile si l'org ferme)
  async removeAllUsersFromOrganization(organizationId: string): Promise<number> {
    const result = await this.userRepository.update(
      { organizationId },
      { organizationId: null }
    );

    return result.affected || 0;
  }

  // PASSWORD RESET TOKEN MANAGEMENT 

  async setResetPasswordToken(userId: string, token: string, expires: Date): Promise<void> {
    await this.userRepository.update(userId, {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    });
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { resetPasswordToken: token },
    });
  }

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await this.userRepository.save(user);
  }

  //  EMAIL VERIFICATION TOKEN MANAGEMENT 

  async setEmailVerificationToken(userId: string, token: string): Promise<void> {
    await this.userRepository.update(userId, {
      emailVerificationToken: token,
    });
  }

  async findByEmailVerificationToken(token: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { emailVerificationToken: token },
    });
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      emailVerified: true,
      emailVerificationToken: null,
    });
  }

}
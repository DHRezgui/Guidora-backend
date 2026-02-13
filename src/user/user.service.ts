import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UserResponse } from './types/user-response.type';
import { OrganizationService } from '../organization/organization.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly organizationService: OrganizationService,
  ) {}


  private toUserResponse(user: User): UserResponse {
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
    };
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
  async findAll(): Promise<UserResponse[]> {
    const users = await this.userRepository.find({
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'organizationId', 'isActive', 'emailVerified', 'createdAt', 'lastLoginAt'],
    });
    return users.map(user => this.toUserResponse(user));
  }

  // Utilisateur par ID SANS password
  async findById(id: string): Promise<UserResponse> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'organizationId', 'isActive', 'emailVerified', 'createdAt', 'lastLoginAt'],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return this.toUserResponse(user);
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
  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponse> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

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

    const updatedUser = await this.userRepository.save(user);

    return this.toUserResponse(updatedUser);
  }

  // Supprimer avec vérification
  async delete(id: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    await this.userRepository.remove(user);
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
  async assignToOrganization(userId: string, organizationName: string): Promise<UserResponse> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

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

    return this.toUserResponse(updatedUser);
  }

  // Désassigner un utilisateur d'une organisation
  async removeFromOrganization(userId: string): Promise<UserResponse> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!user.organizationId) {
      throw new HttpException(
        'Cet utilisateur n\'appartient à aucune organisation',
        HttpStatus.BAD_REQUEST
      );
    }

    // Désassigner
    user.organizationId = null;
    const updatedUser = await this.userRepository.save(user);

    return this.toUserResponse(updatedUser);
  }

  // Désassigner tous les users d'une organisation (utile si l'org ferme)
  async removeAllUsersFromOrganization(organizationId: string): Promise<number> {
    const result = await this.userRepository.update(
      { organizationId },
      { organizationId: null }
    );

    return result.affected || 0;
  }

}
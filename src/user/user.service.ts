import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UserResponse } from './types/user-response.type';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}


  private toUserResponse(user: User): UserResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
  
  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new HttpException('Cet email est déjà utilisé', HttpStatus.CONFLICT);
    }

    const user = this.userRepository.create(createUserDto);
    user.isActive = false;
    const savedUser = await this.userRepository.save(user);

    // Retourner SANS le password
    return this.toUserResponse(savedUser);
  }

  // Utilisateurs SANS password
  async findAll(): Promise<UserResponse[]> {
    const users = await this.userRepository.find({
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'createdAt', 'lastLoginAt'],
    });
    return users.map(user => this.toUserResponse(user));
  }

  // Utilisateur par ID SANS password
  async findById(id: string): Promise<UserResponse> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'createdAt', 'lastLoginAt'],
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
}
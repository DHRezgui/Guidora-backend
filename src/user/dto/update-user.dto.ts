import { IsOptional, IsString, MinLength, MaxLength, IsEmail, IsEnum, IsBoolean, IsDate } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserRole } from '../entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email invalide' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  @ApiProperty({ description: 'L\'adresse email de l\'utilisateur', example: 'admin@trustdev.com', format: 'email', required: false })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Le prénom ne peut pas dépasser 50 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'Le prénom de l\'utilisateur', maxLength: 50, required: false , example: 'Dhia' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Le nom ne peut pas dépasser 50 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'Le nom de l\'utilisateur', maxLength: 50, required: false, example: 'Rezgui' })
  lastName?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Le rôle doit être ADMIN, DEVELOPER ou USER' })
  @ApiProperty({ description: 'Le rôle de l\'utilisateur', enum: UserRole, required: false, example: UserRole.USER })
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ description: 'Indique si l\'utilisateur est actif', required: false })
  isActive?: boolean;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  @ApiProperty({ description: 'La date et l\'heure de la dernière connexion de l\'utilisateur', type: 'string', format: 'date-time', required: false , example: '2024-06-01T12:34:56Z' })
  lastLoginAt?: Date;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(50)
  @ApiProperty({ description: 'Le nouveau mot de passe de l\'utilisateur', example: 'adminadmin123', minLength: 8, maxLength: 50, required: false })
  newPassword?: string;
}
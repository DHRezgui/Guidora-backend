import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email invalide' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(30, { message: 'Le mot de passe ne peut pas dépasser 30 caractères' })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Le prénom ne peut pas dépasser 50 caractères' })
  @Transform(({ value }) => value?.trim())
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Le nom ne peut pas dépasser 50 caractères' })
  @Transform(({ value }) => value?.trim())
  lastName?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Le rôle doit être ADMIN, DEVELOPER ou USER' })
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
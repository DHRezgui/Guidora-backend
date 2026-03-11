import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsEnum, IsBoolean, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email invalide' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  @ApiProperty({ description: 'The user\'s email address', example: 'admin@trustdev.com', format: 'email' })
  email: string;

  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(30, { message: 'Le mot de passe ne peut pas dépasser 30 caractères' })
  @ApiProperty({ description: 'The user\'s password', example: 'admin123', minLength: 8, maxLength: 30 })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Le prénom ne peut pas dépasser 50 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'The user\'s first name', maxLength: 50, required: false, example: 'Dhia' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Le nom ne peut pas dépasser 50 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'The user\'s last name', maxLength: 50, required: false, example: 'Rezgui' })
  lastName?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Le rôle doit être ADMIN, DEVELOPER ou USER' })
  @ApiProperty({ description: 'The user\'s role', enum: UserRole, enumName: 'UserRole', required: false, default: UserRole.USER , example: UserRole.USER })
  role?: UserRole;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ description: 'The ID of the organization the user is associated with', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' , required: false })
  organizationId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'The name of the organization the user is associated with (optional if organizationId is provided)', example: 'Trustdev', required: false })
  organizationName?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ description: 'Indicates whether the user is active', required: false, default: true })
  isActive?: boolean;
}
import { IsOptional, IsString, MinLength, MaxLength, IsEmail, IsEnum, IsBoolean, IsDate } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserRole } from '../entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email invalide' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  @ApiProperty({ description: 'The user\'s email address', example: 'admin@trustdev.com', format: 'email', required: false })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Le prénom ne peut pas dépasser 50 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'The user\'s first name', maxLength: 50, required: false , example: 'Dhia' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Le nom ne peut pas dépasser 50 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'The user\'s last name', maxLength: 50, required: false, example: 'Rezgui' })
  lastName?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Le rôle doit être SUPER_ADMIN, ADMIN, DEVELOPER ou USER' })
  @ApiProperty({ description: 'The user\'s role', enum: UserRole, required: false, example: UserRole.USER })
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ description: 'Indicates whether the user is active', required: false })
  isActive?: boolean;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  @ApiProperty({ description: 'The date and time of the user\'s last login', type: 'string', format: 'date-time', required: false , example: '2024-06-01T12:34:56Z' })
  lastLoginAt?: Date;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(50)
  @ApiProperty({ description: 'The user\'s new password', example: 'adminadmin123', minLength: 8, maxLength: 50, required: false })
  newPassword?: string;
}
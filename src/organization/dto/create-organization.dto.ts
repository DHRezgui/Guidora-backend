import { IsString, IsEnum, IsOptional, IsInt, IsBoolean, Min, Max, MaxLength, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { PlanType } from '../entities/organization.entity';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @IsString({ message: 'Le nom est requis' })
  @MaxLength(255, { message: 'Le nom ne peut pas dépasser 255 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ 
    description: 'Le nom de l\'organisation',
    example: 'Trustdev'
  })
  name: string;

  @IsString({ message: 'La clé API est requise' })
  @MaxLength(255, { message: 'La clé API ne peut pas dépasser 255 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ 
    description: 'La clé API unique de l\'organisation',
    example: 'onb_trustdev_xyz123'
  })
  apiKey: string;

  @IsOptional()
  @IsEnum(PlanType, { message: 'Le plan doit être FREE, PRO ou ENTERPRISE' })
  @ApiProperty({ 
    description: 'Le plan de l\'organisation',
    example: 'PRO',
    enum: PlanType,
    enumName: 'PlanType',
    required: false,
    default: PlanType.FREE
  })
  plan?: PlanType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ 
    description: 'Le domaine de l\'organisation',
    example: 'Trustdev.com',
    required: false
  })
  domain?: string;

  @IsOptional()
  @IsObject({ message: 'Les paramètres doivent être un objet JSON' })
  @ApiProperty({ 
    description: 'Les paramètres de l\'organisation',
    example: { theme: 'dark', language: 'fr' },
    required: false,
    default: {}
  })
  settings?: Record<string, any>;

  @IsOptional()
  @IsInt({ message: 'Le nombre maximum de tours doit être un entier' })
  @Min(1, { message: 'Le nombre minimum de tours est 1' })
  @Max(1000, { message: 'Le nombre maximum de tours est 1000' })
  @ApiProperty({ 
    description: 'Le nombre maximum de tours autorisés',
    example: 50,
    required: false
  })
  maxTours?: number;

  @IsOptional()
  @IsInt({ message: 'Le nombre maximum d\'utilisateurs doit être un entier' })
  @Min(1, { message: 'Le nombre minimum d\'utilisateurs est 1' })
  @Max(10000, { message: 'Le nombre maximum d\'utilisateurs est 10000' })
  @ApiProperty({ 
    description: 'Le nombre maximum d\'utilisateurs autorisés',
    example: 500,
    required: false
  })
  maxUsers?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ 
    description: 'Indique si l\'organisation est active',
    example: true,
    required: false,
    default: true
  })
  isActive?: boolean;
}
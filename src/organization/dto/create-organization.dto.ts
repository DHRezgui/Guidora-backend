import { IsString, IsEnum, IsOptional, IsInt, IsBoolean, Min, Max, MaxLength, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { PlanType } from '../entities/organization.entity';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @IsString({ message: 'Le nom est requis' })
  @MaxLength(255, { message: 'Le nom ne peut pas dépasser 255 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ 
    description: 'The name of the organization',
    example: 'Trustdev'
  })
  name: string;

  @IsString({ message: 'La clé API est requise' })
  @MaxLength(255, { message: 'La clé API ne peut pas dépasser 255 caractères' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ 
    description: 'The unique API key of the organization',
    example: 'onb_trustdev_xyz123'
  })
  apiKey: string;

  @IsOptional()
  @IsEnum(PlanType, { message: 'Le plan doit être FREE, PRO ou ENTERPRISE' })
  @ApiProperty({ 
    description: 'The organization\'s plan',
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
    description: 'The organization\'s domain',
    example: 'Trustdev.com',
    required: false
  })
  domain?: string;

  @IsOptional()
  @IsObject({ message: 'Les paramètres doivent être un objet JSON' })
  @ApiProperty({ 
    description: 'The organization\'s settings',
    example: { theme: 'dark', language: 'fr' },
    required: false,
    default: {}
  })
  settings?: Record<string, any>;

  @IsOptional()
  @IsInt({ message: 'Le nombre maximum d\'utilisateurs doit être un entier' })
  @Min(1, { message: 'Le nombre minimum d\'utilisateurs est 1' })
  @Max(10000, { message: 'Le nombre maximum d\'utilisateurs est 10000' })
  @ApiProperty({ 
    description: 'The maximum number of users allowed',
    example: 500,
    required: false
  })
  maxUsers?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ 
    description: 'Indicates whether the organization is active',
    example: true,
    required: false,
    default: true
  })
  isActive?: boolean;
}
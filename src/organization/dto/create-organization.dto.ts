import { IsString, IsEnum, IsOptional, IsInt, IsBoolean, Min, Max, MaxLength, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { PlanType } from '../entities/organization.entity';

export class CreateOrganizationDto {
  @IsString({ message: 'Le nom est requis' })
  @MaxLength(255, { message: 'Le nom ne peut pas dépasser 255 caractères' })
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsString({ message: 'La clé API est requise' })
  @MaxLength(255, { message: 'La clé API ne peut pas dépasser 255 caractères' })
  @Transform(({ value }) => value?.trim())
  apiKey: string;

  @IsOptional()
  @IsEnum(PlanType, { message: 'Le plan doit être FREE, PRO ou ENTERPRISE' })
  plan?: PlanType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  domain?: string;

  @IsOptional()
  @IsObject({ message: 'Les paramètres doivent être un objet JSON' })
  settings?: Record<string, any>;

  @IsOptional()
  @IsInt({ message: 'Le nombre maximum de tours doit être un entier' })
  @Min(1, { message: 'Le nombre minimum de tours est 1' })
  @Max(1000, { message: 'Le nombre maximum de tours est 1000' })
  maxTours?: number;

  @IsOptional()
  @IsInt({ message: 'Le nombre maximum d\'utilisateurs doit être un entier' })
  @Min(1, { message: 'Le nombre minimum d\'utilisateurs est 1' })
  @Max(10000, { message: 'Le nombre maximum d\'utilisateurs est 10000' })
  maxUsers?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
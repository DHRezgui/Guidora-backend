import { IsString, IsEnum, IsOptional, IsInt, IsBoolean, Min, Max, MaxLength, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { PlanType } from '../entities/organization.entity';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'Le nom de l\'organisation', maxLength: 255, required: false , example: 'Trustdev' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'La clé API de l\'organisation', maxLength: 255, required: false, example: 'onb_trustdev_xyz123' })
  apiKey?: string;

  @IsOptional()
  @IsEnum(PlanType, { message: 'Le plan doit être FREE, PRO ou ENTERPRISE' })
  @ApiProperty({ description: 'Le plan de l\'organisation', enum: PlanType, required: false, example: PlanType.PRO })
  plan?: PlanType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'Le domaine de l\'organisation', maxLength: 255, required: false, example: 'Trustdev.com' })
  domain?: string;

  @IsOptional()
  @IsObject()
  @ApiProperty({ description: 'Les paramètres de l\'organisation', required: false, default: {}, example: { theme: 'light', language: 'eng' } })
  settings?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @ApiProperty({ description: 'Le nombre maximum de tours autorisés', minimum: 1, maximum: 1000, required: false, example: 100 })
  maxTours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  @ApiProperty({ description: 'Le nombre maximum d\'utilisateurs autorisés', minimum: 1, maximum: 10000, required: false, example: 500 }) 
  maxUsers?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ description: 'Indique si l\'organisation est active', required: false, default: true })
  isActive?: boolean;
}
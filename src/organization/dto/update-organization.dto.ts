import { IsString, IsEnum, IsOptional, IsInt, IsBoolean, Min, Max, MaxLength, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { PlanType } from '../entities/organization.entity';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  apiKey?: string;

  @IsOptional()
  @IsEnum(PlanType, { message: 'Le plan doit être FREE, PRO ou ENTERPRISE' })
  plan?: PlanType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  domain?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxTours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxUsers?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
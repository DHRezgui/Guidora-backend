import { IsString, IsEnum, IsOptional, IsInt, IsBoolean, Min, Max, MaxLength, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { PlanType } from '../entities/organization.entity';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'The name of the organization', maxLength: 255, required: false , example: 'Trustdev' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'The API key of the organization', maxLength: 255, required: false, example: 'onb_trustdev_xyz123' })
  apiKey?: string;

  @IsOptional()
  @IsEnum(PlanType, { message: 'Le plan doit être FREE, PRO ou ENTERPRISE' })
  @ApiProperty({ description: 'The organization\'s plan', enum: PlanType, required: false, example: PlanType.PRO })
  plan?: PlanType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ description: 'The organization\'s domain', maxLength: 255, required: false, example: 'Trustdev.com' })
  domain?: string;

  @IsOptional()
  @IsObject()
  @ApiProperty({ description: 'The organization\'s settings', required: false, default: {}, example: { theme: 'light', language: 'eng' } })
  settings?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  @ApiProperty({ description: 'The maximum number of users allowed', minimum: 1, maximum: 10000, required: false, example: 500 }) 
  maxUsers?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ description: 'Indicates whether the organization is active', required: false, default: true })
  isActive?: boolean;
}
/**
 * DTOs for Real-time Prediction API
 */

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PredictionFeaturesDto {
  // Numeric behavioral features
  @ApiProperty({ example: 83, description: 'Time spent on page in seconds' })
  @IsNumber()
  @Min(0)
  timeOnPage: number;

  @ApiProperty({ example: 41.4, description: 'Scroll depth percentage (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  scrollDepth: number;

  @ApiProperty({ example: 2, description: 'Number of click misses' })
  @IsInt()
  @Min(0)
  clickMisses: number;

  @ApiProperty({ example: 1, description: 'Number of hesitation events' })
  @IsInt()
  @Min(0)
  hesitations: number;

  @ApiPropertyOptional({
    example: 0.2,
    description: 'Optional initial abandonment score from client side',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  abandonmentRisk?: number;

  // Binary features
  @ApiProperty({ example: 0, enum: [0, 1] })
  @IsInt()
  @Min(0)
  @Max(1)
  helpTriggered: 0 | 1;

  @ApiProperty({ example: 0, enum: [0, 1] })
  @IsInt()
  @Min(0)
  @Max(1)
  hasError: 0 | 1;

  @ApiProperty({ example: 1, enum: [0, 1] })
  @IsInt()
  @Min(0)
  @Max(1)
  multiplePages: 0 | 1;

  @ApiPropertyOptional({
    example: 45,
    description: 'Seconds since last user interaction (SDK idleSeconds)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  idleSeconds?: number;

  @ApiPropertyOptional({
    example: 28,
    description:
      'Seconds on the current URL (SDK pageTime). When omitted, defaults to timeOnPage.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pageTime?: number;

  // Derived features (optional - can be computed server-side)
  @ApiPropertyOptional({ example: 41.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  timePerPage?: number;

  @ApiPropertyOptional({ example: 0.4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  clickMissRate?: number;

  @ApiPropertyOptional({ example: 0.2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  hesitationRate?: number;

  @ApiPropertyOptional({ example: 0.35 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  frictionScore?: number;

  @ApiPropertyOptional({ example: 0, enum: [0, 1] })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  highFriction?: 0 | 1;

  @ApiPropertyOptional({ example: 0, enum: [0, 1] })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  multipleIssues?: 0 | 1;
}

export class PredictionRequestDto {
  @ApiProperty({ type: PredictionFeaturesDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PredictionFeaturesDto)
  features: PredictionFeaturesDto;

  @ApiPropertyOptional({
    example: 0.5,
    description: 'Decision threshold. Defaults to 0.5',
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number; // Decision boundary (default: 0.5)

  @ApiPropertyOptional({
    example: '3f50c2a1-8c4d-4f3a-9c2e-1a2b3c4d5e6f',
    description: 'Optional session identifier',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string; // Optional session identifier

  @ApiPropertyOptional({
    example: true,
    description: 'Request SHAP feature contributions (requires debug=true)',
  })
  @IsOptional()
  @IsBoolean()
  explain?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Debug mode gate for expensive explainability paths',
  })
  @IsOptional()
  @IsBoolean()
  debug?: boolean;
}

export class AbandonmentFeatureContributionDto {
  @ApiProperty({ example: 'frictionScore' })
  @IsString()
  feature: string;

  @ApiProperty({ example: 0.1245 })
  @IsNumber()
  contribution: number;

  @ApiProperty({ example: 0.82 })
  @IsNumber()
  value: number;
}

export class AbandonmentMlExplanationDto {
  @ApiProperty({ type: [AbandonmentFeatureContributionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AbandonmentFeatureContributionDto)
  topFeatures: AbandonmentFeatureContributionDto[];

  @ApiPropertyOptional({ example: 0.35 })
  @IsOptional()
  @IsNumber()
  expectedValue?: number;

  @ApiPropertyOptional({
    example: 0.35,
    description: 'Baseline abandonment probability (0-1) derived from SHAP expected value',
  })
  @IsOptional()
  @IsNumber()
  baseProbability?: number;
}

export class PredictionResultDto {
  @ApiProperty({ example: 0.325 })
  @IsNumber()
  abandonmentRisk: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  willAbandon: boolean;

  @ApiProperty({ example: 0.95 })
  @IsNumber()
  confidence: number;

  @ApiProperty({ example: 0.5 })
  @IsNumber()
  threshold: number;

  @ApiPropertyOptional({ type: AbandonmentMlExplanationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AbandonmentMlExplanationDto)
  explanation?: AbandonmentMlExplanationDto;
}

export class PredictionMetadataDto {
  @ApiProperty({ example: '1.0' })
  @IsString()
  modelVersion: string;

  @ApiProperty({ example: 145 })
  @IsInt()
  executionTimeMs: number;
}

export class PredictionResponseDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  success: boolean;

  @ApiPropertyOptional({ type: PredictionResultDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PredictionResultDto)
  prediction?: PredictionResultDto;

  @ApiPropertyOptional({ example: 'Prediction failed' })
  @IsOptional()
  @IsString()
  error?: string; // Error message if failed

  @ApiPropertyOptional({
    example: 'worker_unavailable',
    description: 'Machine-readable failure reason when success is false',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: '2026-03-25T10:30:00.000Z' })
  @IsOptional()
  @IsString()
  timestamp?: string; // ISO timestamp

  @ApiPropertyOptional({ type: PredictionMetadataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PredictionMetadataDto)
  metadata?: PredictionMetadataDto;
}

export class BatchPredictionRequestDto {
  @ApiProperty({ type: [PredictionRequestDto] })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PredictionRequestDto)
  predictions: PredictionRequestDto[];
}

export class BatchPredictionResponseDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  success: boolean;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  total: number;

  @ApiPropertyOptional({ type: [PredictionResponseDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PredictionResponseDto)
  predictions?: PredictionResponseDto[];

  @ApiPropertyOptional({ example: 'Batch prediction failed' })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({ example: '2026-03-25T10:30:00.000Z' })
  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class ModelHealthDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  success: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  modelLoaded: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the persistent Python abandonment worker is warmed up',
  })
  @IsOptional()
  @IsBoolean()
  workerReady?: boolean;

  @ApiPropertyOptional({ example: '1.0' })
  @IsOptional()
  @IsString()
  modelVersion?: string;

  @ApiPropertyOptional({ example: 13 })
  @IsOptional()
  @IsInt()
  @Min(0)
  featureCount?: number;

  @ApiPropertyOptional({ example: '2026-03-25T10:30:00.000Z' })
  @IsOptional()
  @IsString()
  lastUpdated?: string;
}

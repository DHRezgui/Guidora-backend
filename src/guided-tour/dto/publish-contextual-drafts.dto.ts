import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ActionType, PositionType } from '../../step/enums/tour.enums';

export enum ContextualScenario {
  SIMPLE = 'simple',
  MEDIUM = 'medium',
  DYNAMIC = 'dynamic',
}

export class ContextualFlowVersioningDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'flow-v3' })
  flowVersion!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'sig-4f2a7d9a' })
  flowSignature!: string;
}

export class ContextualDraftStepDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Valider le formulaire' })
  title!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Cliquez sur valider pour continuer.' })
  content!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: '[data-tour-id="tour-medium-validate-identity"]', required: false })
  targetSelector?: string;

  @IsEnum(PositionType)
  @IsOptional()
  @ApiProperty({ enum: PositionType, required: false })
  position?: PositionType;

  @IsEnum(ActionType)
  @IsOptional()
  @ApiProperty({ enum: ActionType, required: false })
  action?: ActionType;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false, default: true })
  skipAllowed?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false, default: true })
  highlightElement?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false, default: false })
  isPrimary?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false, example: 'primary-action' })
  intent?: string;
}

export class ContextualSuggestedDraftDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Validation du KYC' })
  name!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  description?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: '/dashboard/sdk-tests/medium' })
  targetUrl!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false, example: 'primary-action' })
  intent?: string;

  @IsNumber()
  @ApiProperty({ example: 84 })
  confidence!: number;

  @IsNumber()
  @ApiProperty({ example: 89 })
  score!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContextualDraftStepDto)
  @ApiProperty({ type: [ContextualDraftStepDto] })
  steps!: ContextualDraftStepDto[];

  @ValidateNested()
  @Type(() => ContextualFlowVersioningDto)
  @ApiProperty({ type: ContextualFlowVersioningDto })
  flowVersioning!: ContextualFlowVersioningDto;

  @IsObject()
  @IsOptional()
  @ApiProperty({ required: false, description: 'Explainability snapshot from SDK' })
  explainability?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiProperty({ required: false, description: 'Diagnostics snapshot from SDK' })
  diagnostics?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiProperty({ required: false, description: 'Raw metadata payload from SDK (includes previewContext for simulator reconstruction)' })
  metadata?: Record<string, unknown>;
}

export class PublishContextualDraftsDto {
  @IsEnum(ContextualScenario)
  @ApiProperty({ enum: ContextualScenario, example: ContextualScenario.MEDIUM })
  scenario!: ContextualScenario;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContextualSuggestedDraftDto)
  @ApiProperty({ type: [ContextualSuggestedDraftDto] })
  drafts!: ContextualSuggestedDraftDto[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false, default: true })
  autoActivate?: boolean;
}

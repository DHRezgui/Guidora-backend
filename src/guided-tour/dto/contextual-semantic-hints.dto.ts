import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ContextualSemanticPageSnapshotDto {
  @IsBoolean()
  @ApiProperty()
  hasForm!: boolean;

  @IsBoolean()
  @ApiProperty()
  hasNavigation!: boolean;

  @IsInt()
  @ApiProperty()
  formFieldCount!: number;

  @IsInt()
  @ApiProperty()
  navigationLinkCount!: number;

  @IsInt()
  @ApiProperty()
  ctaCount!: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  pageTitle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  pageHeading?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ type: [String], required: false })
  contextTokens?: string[];
}

export class ContextualSemanticCandidateDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  selector!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  label?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  tag?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  intent?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  zone?: string;
}

export class ContextualSemanticHintsRequestDto {
  @ValidateNested()
  @Type(() => ContextualSemanticPageSnapshotDto)
  @ApiProperty({ type: ContextualSemanticPageSnapshotDto })
  snapshot!: ContextualSemanticPageSnapshotDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContextualSemanticCandidateDto)
  @ApiProperty({ type: [ContextualSemanticCandidateDto] })
  candidates!: ContextualSemanticCandidateDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ type: [String], required: false })
  hints?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ type: [String], required: false })
  objectives?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  persona?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  pathname?: string;
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFaqEntryDto {
  @ApiProperty({ example: 'Comment reinitialiser mon mot de passe ?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question: string;

  @ApiProperty({ example: "Depuis l'ecran de connexion, cliquez sur Mot de passe oublie." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  answer: string;

  @ApiPropertyOptional({ example: 'auth' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ type: [String], example: ['password', 'login'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 'test-11-v1',
    description: 'Host app / flow identifier. Aligns with SDK contextualSuggestions.flowVersion.',
    default: 'default',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectKey?: string;
}

export class UpdateFaqEntryDto extends PartialType(CreateFaqEntryDto) {}

export class SetFaqEntryActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class FaqEntryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organizationId: string;

  @ApiProperty({ example: 'test-11-v1' })
  projectKey: string;

  @ApiProperty()
  question: string;

  @ApiProperty()
  answer: string;

  @ApiPropertyOptional()
  category: string | null;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  viewCount: number;

  @ApiProperty()
  helpfulCount: number;

  @ApiProperty()
  notHelpfulCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class FaqManageListResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  count: number;

  @ApiProperty({ type: [FaqEntryResponseDto] })
  items: FaqEntryResponseDto[];

  @ApiPropertyOptional({ type: [String], example: ['default', 'test-11-v1'] })
  projectKeys?: string[];

  @ApiPropertyOptional({
    example: { default: 50, 'test-11-v1': 1 },
    description: 'Entry count per FAQ pack for dashboard tabs',
  })
  projectKeyCounts?: Record<string, number>;

  @ApiPropertyOptional({
    example: { 'test-11-v1': 3 },
    description: 'Contextual tour count per flowVersion (aligned with FAQ project keys)',
  })
  projectKeyTourCounts?: Record<string, number>;
}

export class FaqReindexResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  embeddedCount?: number;

  @ApiPropertyOptional()
  embeddingsPath?: string;
}

export class ImportGlobalFaqDto {
  @ApiPropertyOptional({
    default: true,
    description: 'Ignore catalog entries whose question already exists in the organization FAQ',
  })
  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Delete all existing organization FAQ entries before importing',
  })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;

  @ApiPropertyOptional({
    example: 'test-11-v1',
    description: 'Target FAQ pack / project key for imported entries',
    default: 'default',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectKey?: string;
}

export class RegisterFaqProjectDto {
  @ApiProperty({ example: 'test-11-v1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  projectKey: string;
}

export class RegisterFaqProjectResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  projectKey: string;

  @ApiProperty({ description: 'True when a new registry row was created' })
  created: boolean;
}

export class DeleteFaqProjectResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty()
  deleted: number;
}

export class FaqImportGlobalResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty()
  imported: number;

  @ApiProperty()
  skipped: number;

  @ApiProperty()
  totalInCatalog: number;
}

export class FaqClearAllResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty()
  deleted: number;
}

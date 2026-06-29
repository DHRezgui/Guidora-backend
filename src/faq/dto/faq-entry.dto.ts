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

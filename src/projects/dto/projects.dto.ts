import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { FaqEntryResponseDto } from '../../faq/dto/faq-entry.dto';

export class ProjectListItemDto {
  @ApiProperty({ example: 'test-11-v1' })
  projectKey: string;

  @ApiProperty({ example: 12 })
  faqCount: number;

  @ApiProperty({ example: 3 })
  tourCount: number;

  @ApiProperty({ example: 2 })
  blueprintCount: number;
}

export class ProjectListResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: [ProjectListItemDto] })
  projects: ProjectListItemDto[];
}

export class ProjectOverviewBlueprintDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  blueprintId: string;

  @ApiProperty()
  vertical: string;

  @ApiProperty()
  isPublished: boolean;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  updatedAt?: Date;
}

export class ProjectOverviewTourDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  targetUrl: string;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  environment?: string;

  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected', 'returned'] })
  sandboxStatus?: string | null;

  @ApiPropertyOptional()
  isSandboxTestActive?: boolean;

  @ApiPropertyOptional()
  stepCount?: number;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;

  @ApiPropertyOptional()
  createdBy?: string;

  @ApiPropertyOptional({ type: [String] })
  assignedAdminIds?: string[];

  @ApiPropertyOptional()
  inCollaboration?: boolean;

  @ApiPropertyOptional()
  accessGrants?: Array<{ userId: string; accessMode: string }>;

  @ApiPropertyOptional()
  triggerConditions?: Record<string, unknown>;

  @ApiPropertyOptional()
  developerPrivate?: boolean;

  @ApiPropertyOptional()
  sandboxRejectionReason?: string | null;

  @ApiPropertyOptional()
  sharingHasView?: boolean;

  @ApiPropertyOptional()
  sharingHasCollaborate?: boolean;

  @ApiPropertyOptional()
  sandboxRejectedBy?: string | null;
}

export class ProjectOverviewIndexDto {
  @ApiProperty()
  activeCount: number;

  @ApiProperty()
  embeddingsReady: boolean;

  @ApiProperty()
  needsReindex: boolean;

  @ApiPropertyOptional()
  lastIndexedAt?: string | null;
}

export class ProjectOverviewResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ example: 'test-11-v1' })
  projectKey: string;

  @ApiProperty({ example: 12 })
  faqCount: number;

  @ApiProperty({ example: 3 })
  tourCount: number;

  @ApiProperty({ example: 2 })
  blueprintCount: number;

  @ApiProperty({ type: [FaqEntryResponseDto] })
  recentFaqItems: FaqEntryResponseDto[];

  @ApiProperty({ type: [ProjectOverviewTourDto] })
  recentTours: ProjectOverviewTourDto[];

  @ApiProperty({ type: [ProjectOverviewBlueprintDto] })
  recentBlueprints: ProjectOverviewBlueprintDto[];

  @ApiPropertyOptional({ type: ProjectOverviewIndexDto })
  indexStatus?: ProjectOverviewIndexDto | null;
}

export class ProjectDeleteScopeProductionTourDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class ProjectDeleteScopeLockedBlueprintDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  blueprintId: string;

  @ApiPropertyOptional()
  heldByDisplayName?: string;
}

export class ProjectDeleteScopePreviewResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  projectKey: string;

  @ApiProperty()
  faqCount: number;

  @ApiProperty()
  tourCount: number;

  @ApiProperty()
  blueprintCount: number;

  @ApiProperty()
  labTourSkippedCount: number;

  @ApiProperty({ type: [ProjectDeleteScopeProductionTourDto] })
  productionTours: ProjectDeleteScopeProductionTourDto[];

  @ApiProperty({ type: [ProjectDeleteScopeLockedBlueprintDto] })
  lockedBlueprints: ProjectDeleteScopeLockedBlueprintDto[];

  @ApiProperty()
  canDelete: boolean;

  @ApiPropertyOptional()
  blockReason?: string;

  @ApiProperty()
  isEmpty: boolean;
}

export class DeleteProjectScopeDto {
  @ApiProperty({ example: 'test-11-v1', description: 'Must match projectKey exactly' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  confirmProjectKey: string;
}

export class DeleteProjectScopeResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  projectKey: string;

  @ApiProperty()
  faqDeleted: number;

  @ApiProperty()
  toursDeleted: number;

  @ApiProperty()
  blueprintsDeleted: number;

  @ApiProperty()
  labToursSkipped: number;

  @ApiProperty()
  message: string;
}

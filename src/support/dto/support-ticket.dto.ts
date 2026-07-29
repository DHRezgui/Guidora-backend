import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PriorityLevel, TicketStatus } from '../entities/support-ticket.entity';

export class CreateSupportTicketDto {
  @ApiProperty({ description: 'Ticket subject', minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @ApiProperty({ description: 'User message', minLength: 5, maxLength: 5000 })
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  message: string;

  @ApiProperty({ description: 'Contact email required to receive a reply' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ description: 'Page URL where the ticket was created' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageUrl?: string;

  @ApiPropertyOptional({
    description: 'Host app / flow key (aligns with SDK flowVersion / FAQ projectKey)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectKey?: string;

  @ApiPropertyOptional({
    description: 'Runtime context (assistance state, ML risk, friction, session)',
  })
  @IsOptional()
  @IsObject()
  sessionData?: Record<string, unknown>;
}

export class ReplySupportTicketDto {
  @ApiProperty({ description: 'Admin reply body sent by email', minLength: 5, maxLength: 5000 })
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  message: string;
}

export class UpdateSupportTicketDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: PriorityLevel })
  @IsOptional()
  @IsEnum(PriorityLevel)
  priority?: PriorityLevel;

  @ApiPropertyOptional({
    description: 'Assignee user id (null to unassign) — ADMIN only',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assignedTo?: string | null;

  @ApiPropertyOptional({
    description:
      'Clear a foreign edit lock during take-over (assignedTo = self only)',
  })
  @IsOptional()
  @IsBoolean()
  forceUnlock?: boolean;

  @ApiPropertyOptional({
    description:
      'On assignee change / take-over: keep existing collaborators (default clears them)',
  })
  @IsOptional()
  @IsBoolean()
  keepCollaborators?: boolean;
}

export class SupportCollaboratorDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: ['read', 'write'] })
  @IsIn(['read', 'write'])
  access: 'read' | 'write';
}

export class SetSupportCollaboratorsDto {
  @ApiProperty({ type: [SupportCollaboratorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportCollaboratorDto)
  collaborators: SupportCollaboratorDto[];
}

export class ListSupportTicketsQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ description: 'Filter by project key / flowVersion' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectKey?: string;

  @ApiPropertyOptional({
    description: 'When true, only OPEN and IN_PROGRESS (ignores status if set)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  activeOnly?: boolean;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class SupportTicketResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organizationId: string;

  @ApiPropertyOptional()
  userId?: string | null;

  @ApiPropertyOptional()
  userEmail?: string | null;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: TicketStatus })
  status: TicketStatus;

  @ApiProperty({ enum: PriorityLevel })
  priority: PriorityLevel;

  @ApiProperty()
  projectKey: string;

  @ApiPropertyOptional()
  assignedTo?: string | null;

  @ApiPropertyOptional()
  assigneeEmail?: string | null;

  @ApiPropertyOptional()
  assigneeName?: string | null;

  @ApiPropertyOptional()
  pageUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Contact email for replies (from session_data.contactEmail)',
  })
  contactEmail?: string | null;

  @ApiPropertyOptional()
  sessionData?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Admin replies already emailed to the requester',
    type: 'array',
  })
  adminReplies?: Array<{
    body: string;
    sentAt: string;
    authorId: string | null;
    authorEmail?: string | null;
    authorName?: string | null;
  }>;

  @ApiPropertyOptional()
  resolvedAt?: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class SupportTicketListResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  count: number;

  @ApiProperty({ type: [SupportTicketResponseDto] })
  items: SupportTicketResponseDto[];
}

export class CreateSupportTicketResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: SupportTicketResponseDto })
  ticket: SupportTicketResponseDto;
}

export class ResolveSupportTicketResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: SupportTicketResponseDto })
  ticket: SupportTicketResponseDto;
}

export class UpdateSupportTicketResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: SupportTicketResponseDto })
  ticket: SupportTicketResponseDto;
}

export class ReplySupportTicketResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: SupportTicketResponseDto })
  ticket: SupportTicketResponseDto;
}

export class ArchiveSupportTicketResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: SupportTicketResponseDto })
  ticket: SupportTicketResponseDto;
}

export class DeleteSupportTicketResponseDto {
  @ApiProperty()
  success: boolean;
}

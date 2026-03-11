import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID, IsEnum, IsOptional, IsInt, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EventType } from '../enums/tracking.enums';

export class TrackEventDto {
  @ApiProperty({ example: 'usr-uuid-here' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiProperty({ example: 'sess-uuid-here' })
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ example: 'org-uuid-here' })
  @IsUUID()
  @IsNotEmpty()
  organizationId: string;

  @ApiProperty({ enum: EventType, enumName: 'EventType', example: 'CLICK' })
  @IsEnum(EventType)
  @IsNotEmpty()
  eventType: EventType;

  @ApiProperty({ example: '/dashboard/transfers' })
  @IsString()
  @IsNotEmpty()
  pageUrl: string;

  @ApiPropertyOptional({ example: '#transfer-button' })
  @IsString()
  @IsOptional()
  elementSelector?: string;

  @ApiPropertyOptional({ example: 'Bank transfer' })
  @IsString()
  @IsOptional()
  elementText?: string;

  @ApiPropertyOptional({ example: 75 })
  @IsInt()
  @IsOptional()
  scrollDepth?: number;

  @ApiPropertyOptional({ example: 45 })
  @IsInt()
  @IsOptional()
  timeOnPage?: number;

  @ApiPropertyOptional({
    example: {
      viewportWidth: 1920,
      viewportHeight: 1080,
      userAgent: 'Mozilla/5.0...',
      referrer: '/dashboard',
    },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
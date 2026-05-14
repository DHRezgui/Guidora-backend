import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export enum ContextualFeedbackEventType {
  SHOWN = 'shown',
  CLICKED = 'clicked',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export class ContextualFeedbackEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @ApiProperty({ example: '/dashboard/orders' })
  targetUrl!: string;

  @IsString()
  @IsOptional()
  @MaxLength(1024)
  @ApiProperty({ required: false, example: 'a[data-tour-id="header-nav-contact"]' })
  selector?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @ApiProperty({ example: 'primary-action' })
  intent!: string;

  @IsEnum(ContextualFeedbackEventType)
  @ApiProperty({ enum: ContextualFeedbackEventType, example: ContextualFeedbackEventType.CLICKED })
  event!: ContextualFeedbackEventType;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @ApiProperty({ required: false, default: 1, description: 'Delta to add for this event (1..100)' })
  count?: number;
}

export class SubmitContextualFeedbackDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ContextualFeedbackEventDto)
  @ApiProperty({ type: [ContextualFeedbackEventDto] })
  events!: ContextualFeedbackEventDto[];
}

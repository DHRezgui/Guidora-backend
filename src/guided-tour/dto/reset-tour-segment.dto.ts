import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export enum TourResetSegment {
  ALL = 'all',
  NEW_USERS = 'new_users',
  INACTIVE_USERS = 'inactive_users',
  CUSTOM_USER_IDS = 'custom_user_ids',
}

export class ResetTourSegmentDto {
  @ApiProperty({
    enum: TourResetSegment,
    example: TourResetSegment.INACTIVE_USERS,
  })
  @IsEnum(TourResetSegment)
  segment: TourResetSegment;

  @ApiProperty({
    required: false,
    description: 'Users created in the last X days (segment new_users)',
    example: 14,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  createdWithinDays?: number;

  @ApiProperty({
    required: false,
    description: 'Users inactive since X days (segment inactive_users)',
    example: 60,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  inactiveDays?: number;

  @ApiProperty({
    required: false,
    description: 'Explicit user ids (segment custom_user_ids)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  userIds?: string[];
}

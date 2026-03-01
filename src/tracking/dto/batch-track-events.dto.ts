import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TrackEventDto } from './track-event.dto';

export class BatchTrackEventsDto {
  @ApiProperty({ type: [TrackEventDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events: TrackEventDto[];
}
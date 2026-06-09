import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { TourAccessMode } from '../entities/guided-tour-access-grant.entity';
import { AssignTourSubmissionMessageFields } from './assign-tour-submission-message.dto';

export class TourAccessGrantItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId: string;

  @ApiProperty({ enum: TourAccessMode })
  @IsEnum(TourAccessMode)
  accessMode: TourAccessMode;
}

export class SetTourAccessGrantsDto extends AssignTourSubmissionMessageFields {
  @ApiProperty({ type: [TourAccessGrantItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TourAccessGrantItemDto)
  grants: TourAccessGrantItemDto[];

  @ApiProperty({
    required: false,
    description: 'Si true, remplace tous les grants existants. Sinon fusion par userId.',
    default: true,
  })
  @IsOptional()
  replace?: boolean;

  @ApiPropertyOptional({
    enum: TourAccessMode,
    description: 'Mode de partage concerné par le message optionnel (view ou collaborate).',
  })
  @IsOptional()
  @IsEnum(TourAccessMode)
  messageForMode?: TourAccessMode;
}

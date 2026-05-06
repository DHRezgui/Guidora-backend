import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsObject, IsArray, ValidateNested, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateStepDto } from '../../step/dto/create-step.dto';
import { TourReplayPolicy } from '../entities/guided-tour.entity';


export class CreateGuidedTourDto {
  @IsString({ message: 'Le nom est requis' })
  @IsNotEmpty({ message: 'Le nom ne peut pas être vide' })
  @ApiProperty({ 
    description: 'The name of the guided tour',
    example: 'First transfer',
  })
  name: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ 
    description: 'The detailed description of the guided tour',
    example: 'Step-by-step guide to make your first bank transfer',
    required: false,
  })
  description?: string;

  @IsString({ message: 'L\'URL cible est requise' })
  @IsNotEmpty({ message: 'L\'URL cible ne peut pas être vide' })
  @ApiProperty({ 
    description: 'The URL of the page where the tour is triggered',
    example: '/dashboard/transfers',
  })
  targetUrl: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ 
    description: 'Indicates whether the tour is active and visible to users',
    example: true,
    required: false,
    default: true,
  })
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ 
    description: 'The display priority of the tour (higher = displayed first)',
    example: 10,
    required: false,
    default: 0,
  })
  priority?: number;

  @IsObject({ message: 'Les conditions de déclenchement doivent être un objet JSON' })
  @IsOptional()
  @ApiProperty({ 
    description: 'The trigger conditions for the tour (time on page, required elements, user segment)',
    example: {
      minTimeOnPage: 30,
      requiredElements: ['#transfer-button'],
      userSegment: 'new_user',
    },
    required: false,
    default: {},
  })
  triggerConditions?: Record<string, any>;

  @IsObject({ message: 'Le contexte de simulation doit être un objet JSON' })
  @IsOptional()
  @ApiProperty({
    description: 'Optional structured page context used by simulator preview reconstruction',
    required: false,
    example: {
      pageUrl: 'https://app.example.com/dashboard/users',
      pathname: '/dashboard/users',
      pageTitle: 'Users Dashboard',
    },
  })
  simulationContext?: Record<string, any>;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(TourReplayPolicy))
  @ApiProperty({
    description: 'Replay strategy for already seen users',
    required: false,
    enum: TourReplayPolicy,
    default: TourReplayPolicy.NEVER,
  })
  replayPolicy?: TourReplayPolicy;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({
    description: 'Days before replay when replayPolicy is after_period',
    required: false,
    example: 30,
    default: 0,
  })
  replayAfterDays?: number;

  @IsArray({ message: 'Les étapes doivent être un tableau' })
  @ValidateNested({ each: true })
  @Type(() => CreateStepDto)
  @ApiProperty({ 
    description: 'The list of steps in the guided tour (automatically ordered)',
    type: [CreateStepDto],
  })
  steps: CreateStepDto[];
}
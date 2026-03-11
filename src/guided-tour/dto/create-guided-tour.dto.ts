import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateStepDto } from '../../step/dto/create-step.dto';


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

  @IsArray({ message: 'Les étapes doivent être un tableau' })
  @ValidateNested({ each: true })
  @Type(() => CreateStepDto)
  @ApiProperty({ 
    description: 'The list of steps in the guided tour (automatically ordered)',
    type: [CreateStepDto],
  })
  steps: CreateStepDto[];
}
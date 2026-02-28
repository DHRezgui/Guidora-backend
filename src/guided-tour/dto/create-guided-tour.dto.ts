import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateStepDto } from '../../step/dto/create-step.dto';


export class CreateGuidedTourDto {
  @IsString({ message: 'Le nom est requis' })
  @IsNotEmpty({ message: 'Le nom ne peut pas être vide' })
  @ApiProperty({ 
    description: 'Le nom du parcours guidé',
    example: 'Premier virement',
  })
  name: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ 
    description: 'La description détaillée du parcours guidé',
    example: 'Guide pas-à-pas pour effectuer votre premier virement bancaire',
    required: false,
  })
  description?: string;

  @IsString({ message: 'L\'URL cible est requise' })
  @IsNotEmpty({ message: 'L\'URL cible ne peut pas être vide' })
  @ApiProperty({ 
    description: 'L\'URL de la page sur laquelle le parcours se déclenche',
    example: '/dashboard/transfers',
  })
  targetUrl: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ 
    description: 'Indique si le parcours est actif et visible pour les utilisateurs',
    example: true,
    required: false,
    default: true,
  })
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ 
    description: 'La priorité d\'affichage du parcours (plus élevé = affiché en premier)',
    example: 10,
    required: false,
    default: 0,
  })
  priority?: number;

  @IsObject({ message: 'Les conditions de déclenchement doivent être un objet JSON' })
  @IsOptional()
  @ApiProperty({ 
    description: 'Les conditions de déclenchement du parcours (temps sur la page, éléments requis, segment utilisateur)',
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
    description: 'La liste des étapes du parcours guidé (ordonnées automatiquement)',
    type: [CreateStepDto],
  })
  steps: CreateStepDto[];
}
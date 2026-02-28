import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { PositionType, ActionType } from '../enums/tour.enums';


export class CreateStepDto {
  @IsString({ message: 'Le titre est requis' })
  @IsNotEmpty({ message: 'Le titre ne peut pas être vide' })
  @ApiProperty({ 
    description: 'Le titre de l\'étape affiché à l\'utilisateur',
    example: 'Bienvenue !',
  })
  title: string;

  @IsString({ message: 'Le contenu est requis' })
  @IsNotEmpty({ message: 'Le contenu ne peut pas être vide' })
  @ApiProperty({ 
    description: 'Le contenu textuel de l\'étape (instructions pour l\'utilisateur)',
    example: 'Cliquez ici pour commencer votre premier virement',
  })
  content: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ 
    description: 'Le sélecteur CSS de l\'élément cible sur la page (ex: #btn, .class, [data-id])',
    example: '#transfer-button',
    required: false,
  })
  targetSelector?: string;

  @IsEnum(PositionType, { message: 'La position doit être TOP, BOTTOM, LEFT, RIGHT, CENTER, TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT ou BOTTOM_RIGHT' })
  @IsOptional()
  @ApiProperty({ 
    description: 'La position du tooltip par rapport à l\'élément cible',
    enum: PositionType,
    enumName: 'PositionType',
    example: PositionType.BOTTOM,
    required: false,
    default: PositionType.BOTTOM,
  })
  position?: PositionType;

  @IsEnum(ActionType, { message: 'L\'action doit être CLICK, HOVER, SCROLL, NEXT, SKIP ou COMPLETE' })
  @IsOptional()
  @ApiProperty({ 
    description: 'L\'action requise de l\'utilisateur pour passer à l\'étape suivante',
    enum: ActionType,
    enumName: 'ActionType',
    example: ActionType.CLICK,
    required: false,
    default: ActionType.NEXT,
  })
  action?: ActionType;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ 
    description: 'Indique si l\'utilisateur peut passer cette étape',
    example: true,
    required: false,
    default: true,
  })
  skipAllowed?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ 
    description: 'Indique si l\'élément cible doit être mis en surbrillance',
    example: true,
    required: false,
    default: true,
  })
  highlightElement?: boolean;
}

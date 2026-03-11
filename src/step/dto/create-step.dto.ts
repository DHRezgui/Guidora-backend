import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { PositionType, ActionType } from '../enums/tour.enums';


export class CreateStepDto {
  @IsString({ message: 'Le titre est requis' })
  @IsNotEmpty({ message: 'Le titre ne peut pas être vide' })
  @ApiProperty({ 
    description: 'The step title displayed to the user',
    example: 'Welcome!',
  })
  title: string;

  @IsString({ message: 'Le contenu est requis' })
  @IsNotEmpty({ message: 'Le contenu ne peut pas être vide' })
  @ApiProperty({ 
    description: 'The text content of the step (instructions for the user)',
    example: 'Click here to start your first transfer',
  })
  content: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ 
    description: 'The CSS selector of the target element on the page (e.g.: #btn, .class, [data-id])',
    example: '#transfer-button',
    required: false,
  })
  targetSelector?: string;

  @IsEnum(PositionType, { message: 'La position doit être TOP, BOTTOM, LEFT, RIGHT, CENTER, TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT ou BOTTOM_RIGHT' })
  @IsOptional()
  @ApiProperty({ 
    description: 'The tooltip position relative to the target element',
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
    description: 'The action required from the user to proceed to the next step',
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
    description: 'Indicates whether the user can skip this step',
    example: true,
    required: false,
    default: true,
  })
  skipAllowed?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ 
    description: 'Indicates whether the target element should be highlighted',
    example: true,
    required: false,
    default: true,
  })
  highlightElement?: boolean;
}

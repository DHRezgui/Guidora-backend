import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ReturnToDeveloperDto {
  @IsString({ message: 'Le motif du renvoi est requis' })
  @IsNotEmpty({ message: 'Le motif du renvoi ne peut pas être vide' })
  @MinLength(10, { message: 'Le motif du renvoi doit contenir au moins 10 caractères' })
  @MaxLength(2000, { message: 'Le motif du renvoi ne peut pas dépasser 2000 caractères' })
  @ApiProperty({
    description: 'Motif communiqué au développeur pour la révision du parcours',
    example:
      'Merci de simplifier l’étape 2 et de vérifier le sélecteur sur la page d’accueil avant nouvelle soumission.',
    minLength: 10,
    maxLength: 2000,
  })
  reason: string;
}

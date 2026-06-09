import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** Message optionnel joint à une soumission développeur → admin. */
export class AssignTourSubmissionMessageFields {
  @IsOptional()
  @IsString({ message: 'Le message doit être une chaîne de caractères' })
  @ValidateIf((_, value) => typeof value === 'string' && value.trim().length > 0)
  @MinLength(10, {
    message: 'Le message doit contenir au moins 10 caractères lorsqu’il est renseigné',
  })
  @MaxLength(2000, { message: 'Le message ne peut pas dépasser 2000 caractères' })
  @ApiPropertyOptional({
    description: 'Message optionnel pour l’administrateur modérateur',
    minLength: 10,
    maxLength: 2000,
    example:
      'Parcours prêt pour revue : merci de valider les sélecteurs de l’étape 2 sur la page d’accueil.',
  })
  message?: string;
}

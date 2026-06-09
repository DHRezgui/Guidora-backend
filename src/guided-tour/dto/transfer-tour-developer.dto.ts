import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class TransferTourDeveloperDto {
  @IsUUID('4', { message: 'Identifiant développeur invalide' })
  @IsNotEmpty({ message: 'Le développeur cible est requis' })
  @ApiProperty({
    description: 'Identifiant du nouveau propriétaire développeur',
    format: 'uuid',
  })
  developerId: string;

  @IsString({ message: 'Le motif du transfert est requis' })
  @IsNotEmpty({ message: 'Le motif du transfert ne peut pas être vide' })
  @MinLength(10, { message: 'Le motif du transfert doit contenir au moins 10 caractères' })
  @MaxLength(2000, { message: 'Le motif du transfert ne peut pas dépasser 2000 caractères' })
  @ApiProperty({
    description: 'Motif du transfert de propriété (visible par le nouveau développeur)',
    minLength: 10,
    maxLength: 2000,
  })
  reason: string;
}

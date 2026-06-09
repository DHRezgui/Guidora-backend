import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RejectSandboxTourDto {
  @IsString({ message: 'La cause du rejet est requise' })
  @IsNotEmpty({ message: 'La cause du rejet ne peut pas être vide' })
  @MinLength(10, { message: 'La cause du rejet doit contenir au moins 10 caractères' })
  @MaxLength(2000, { message: 'La cause du rejet ne peut pas dépasser 2000 caractères' })
  @ApiProperty({
    description: 'Motif du rejet communiqué au développeur pour correction',
    example: 'Les étapes 2 et 3 ciblent des sélecteurs invalides sur /dashboard. Merci de corriger les targetSelector.',
    minLength: 10,
    maxLength: 2000,
  })
  reason: string;
}

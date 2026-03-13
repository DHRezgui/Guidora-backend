import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token received by email' })
  @IsString()
  @IsNotEmpty({ message: 'Token requis' })
  token: string;

  @ApiProperty({ example: 'NewPassword123', description: 'New password (8-30 characters)' })
  @IsString()
  @IsNotEmpty({ message: 'Mot de passe requis' })
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(30, { message: 'Le mot de passe ne peut pas dépasser 30 caractères' })
  password: string;
}

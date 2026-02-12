import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginUserDto {
  @IsNotEmpty({ message: 'L\'email est requis' })
  @IsEmail({}, { message: 'Email invalide' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(1, { message: 'Le mot de passe ne peut pas être vide' })
  password: string;
}
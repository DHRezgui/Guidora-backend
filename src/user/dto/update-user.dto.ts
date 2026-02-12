import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional } from 'class-validator/types/decorator/common/IsOptional';
import { IsString } from 'class-validator/types/decorator/typechecker/IsString';
import { MinLength } from 'class-validator/types/decorator/string/MinLength';
import { MaxLength } from 'class-validator/types/decorator/string/MaxLength';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(50)
  newPassword?: string;
}
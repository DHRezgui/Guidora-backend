import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength, MinLength, ArrayUnique } from 'class-validator';

export class CreateSdkIntegrationTokenDto {
  @ApiProperty({ example: 'Application web — production' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description:
      'Requested scopes. Omitted = default developer set. ADMIN-only scopes ignored for DEVELOPER creators.',
    example: ['tours:runtime', 'blueprints:read', 'feedback:write', 'semantic:invoke'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  scopes?: string[];
}

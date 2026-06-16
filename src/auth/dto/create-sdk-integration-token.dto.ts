import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ArrayUnique } from 'class-validator';
import { MAX_SDK_TOKEN_TTL_DAYS, MIN_SDK_TOKEN_TTL_DAYS } from '../sdk-token-lifecycle.constants';

export class CreateSdkIntegrationTokenDto {
  @ApiProperty({ example: 'Application web — production' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: `Token lifetime in days (${MIN_SDK_TOKEN_TTL_DAYS}–${MAX_SDK_TOKEN_TTL_DAYS}). Default: 90.`,
    example: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_SDK_TOKEN_TTL_DAYS)
  @Max(MAX_SDK_TOKEN_TTL_DAYS)
  expiresInDays?: number;

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

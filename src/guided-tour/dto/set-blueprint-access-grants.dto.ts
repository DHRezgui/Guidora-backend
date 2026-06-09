import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { BlueprintAccessMode } from '../entities/organization-journey-blueprint-access-grant.entity';

export class BlueprintAccessGrantItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId: string;

  @ApiProperty({ enum: BlueprintAccessMode })
  @IsEnum(BlueprintAccessMode)
  accessMode: BlueprintAccessMode;
}

export class SetBlueprintAccessGrantsDto {
  @ApiProperty({ type: [BlueprintAccessGrantItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlueprintAccessGrantItemDto)
  grants: BlueprintAccessGrantItemDto[];

  @ApiPropertyOptional({
    description: 'Si true, remplace tous les grants existants. Sinon fusion par userId.',
    default: true,
  })
  @IsOptional()
  replace?: boolean;
}

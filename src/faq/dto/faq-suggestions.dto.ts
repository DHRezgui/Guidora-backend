import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class FaqSuggestionsQueryDto {
  @ApiPropertyOptional({
    description: 'Optional page/tour context used to rank published FAQ questions',
    example: 'Portfolio Overview health score accounts',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of suggestions to return',
    minimum: 1,
    maximum: 10,
    default: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;

  @ApiPropertyOptional({
    description: 'FAQ pack / project key (SDK flowVersion)',
    example: 'test-11-v1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectKey?: string;
}

export class FaqSuggestionItemDto {
  @ApiProperty({ example: 'faq-003' })
  id: string;

  @ApiProperty({ example: 'Comment reinitialiser mon mot de passe ?' })
  question: string;
}

export class FaqSuggestionsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 2 })
  count: number;

  @ApiProperty({ type: [FaqSuggestionItemDto] })
  suggestions: FaqSuggestionItemDto[];
}

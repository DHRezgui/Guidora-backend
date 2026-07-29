import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SemanticSearchRequestDto {
  @ApiProperty({
    description: 'Natural-language user question to search in FAQ',
    example: 'Comment reinitialiser mon mot de passe ?',
  })
  @IsString()
  @MaxLength(500)
  question: string;

  @ApiPropertyOptional({
    description: 'Maximum number of FAQ results to return',
    minimum: 1,
    maximum: 20,
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;

  @ApiPropertyOptional({
    description:
      'Optional initial threshold for adaptive filtering. Backend tries thresholds in sequence (default: 0.70 -> 0.65 -> 0.60). Low-confidence top-1 is only returned if score >= FAQ_FALLBACK_MIN_SCORE (default 0.55); otherwise no_confident_match (empty). Lexical near-exact boost is applied before thresholds (FAQ_LEXICAL_BOOST).',
    minimum: 0,
    maximum: 1,
    default: 0.7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minSimilarity?: number;

  @ApiPropertyOptional({
    description: 'FAQ pack / project key (SDK flowVersion). When omitted, uses the default pack.',
    example: 'test-11-v1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectKey?: string;
}

export class SemanticSearchResultDto {
  @ApiProperty({ example: 'faq-003' })
  id: string;

  @ApiProperty({ example: 'Comment reinitialiser mon mot de passe ?' })
  question: string;

  @ApiProperty({ example: "Depuis l'ecran de connexion, cliquez sur Mot de passe oublie." })
  answer: string;

  @ApiProperty({ example: 'auth' })
  category: string;

  @ApiProperty({ example: 'high' })
  priority: string;

  @ApiProperty({ example: 0.9656 })
  score: number;
}

export class SemanticSearchResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'comment reinitialiser mon mot de passe' })
  query: string;

  @ApiProperty({ example: 3 })
  total: number;

  @ApiPropertyOptional({
    example: 'threshold_0.7',
    description:
      'Adaptive strategy step: threshold_<value>, fallback_top1 (gated), no_confident_match, no_results, no_org_corpus',
  })
  strategyStep?: string;

  @ApiProperty({ type: [SemanticSearchResultDto] })
  results: SemanticSearchResultDto[];
}

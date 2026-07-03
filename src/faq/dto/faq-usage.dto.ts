import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class FaqUsageFeedbackDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  helpful: boolean;
}

export class FaqUsageTrackResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}

export class FaqIndexStatusResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 12 })
  activeCount: number;

  @ApiProperty({ example: true })
  embeddingsReady: boolean;

  @ApiProperty({ example: false })
  needsReindex: boolean;

  @ApiProperty({ example: 'test-11-v1' })
  projectKey: string;

  @ApiProperty({ example: '2026-06-16T12:00:00.000Z', nullable: true })
  lastIndexedAt: string | null;
}

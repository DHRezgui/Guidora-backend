import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../user/entities/user.entity';
import { ApiAuth } from '../swagger/security-schemas';
import { FaqService } from './faq.service';
import { SemanticSearchRequestDto, SemanticSearchResponseDto } from './dto/semantic-search.dto';

@ApiTags('FAQ')
@Controller('faq')
@UseGuards(RolesGuard)
@ApiAuth()
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.USER)
  @Post('semantic-search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Semantic FAQ search',
    description:
      'Returns the most relevant FAQ answers for a natural-language question using cosine similarity over sentence embeddings.',
  })
  @ApiBody({ type: SemanticSearchRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Semantic search completed successfully',
    type: SemanticSearchResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid query payload',
    schema: {
      example: {
        statusCode: 400,
        message: ['question should not be empty'],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async semanticSearch(@Body() request: SemanticSearchRequestDto): Promise<SemanticSearchResponseDto> {
    return this.faqService.semanticSearch(request);
  }
}

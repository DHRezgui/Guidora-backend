import {

  BadRequestException,

  Body,

  Controller,

  Delete,

  ForbiddenException,

  Get,

  HttpCode,

  HttpStatus,

  InternalServerErrorException,

  Param,

  ParseUUIDPipe,

  Query,

  Post,

  Put,

  UseGuards,

} from '@nestjs/common';

import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AllowDashboardJwtOnSdkRoute } from '../auth/decorators/allow-dashboard-jwt-on-sdk-route.decorator';

import { AllowSdkScopes } from '../auth/decorators/allow-sdk-scopes.decorator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { RequireSdkScopes } from '../auth/decorators/require-sdk-scopes.decorator';

import { Roles } from '../auth/decorators/roles.decorator';

import { RolesGuard } from '../auth/guards/roles.guard';

import { ApiAuth } from '../swagger/security-schemas';

import { UserRole } from '../user/entities/user.entity';

import {

  CreateFaqEntryDto,

  FaqManageListResponseDto,

  FaqReindexResponseDto,

  FaqImportGlobalResponseDto,
  FaqClearAllResponseDto,

  ImportGlobalFaqDto,

  SetFaqEntryActiveDto,

  UpdateFaqEntryDto,

} from './dto/faq-entry.dto';

import { SemanticSearchRequestDto, SemanticSearchResponseDto } from './dto/semantic-search.dto';

import {
  FaqSuggestionsQueryDto,
  FaqSuggestionsResponseDto,
} from './dto/faq-suggestions.dto';

import {
  FaqIndexStatusResponseDto,
  FaqUsageFeedbackDto,
  FaqUsageTrackResponseDto,
} from './dto/faq-usage.dto';

import { FaqEntryService } from './faq-entry.service';

import { FaqService } from './faq.service';



@ApiTags('FAQ')

@Controller('faq')

@UseGuards(RolesGuard)

@ApiAuth()

export class FaqController {

	constructor(

		private readonly faqService: FaqService,

		private readonly faqEntryService: FaqEntryService,

	) {}



	private getOrganizationId(user: any): string {

		const organizationId = user?.organizationId || user?.organizations?.[0]?.id;

		if (!organizationId) {

			throw new BadRequestException('Aucune organisation associee a cet utilisateur.');

		}

		return organizationId;

	}



	private getActorId(user: any): string {

		const actorId = user?.id;

		if (!actorId) {

			throw new ForbiddenException('Authentification requise.');

		}

		return actorId;

	}



	@Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.USER)

	@AllowSdkScopes('faq:search')

	@AllowDashboardJwtOnSdkRoute()

	@RequireSdkScopes('faq:search')

	@Get('suggestions')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({

		summary: 'Published FAQ question suggestions',

		description:

			'Returns real published FAQ questions for the caller organization, ranked by page context, priority and helpfulness.',

	})

	@ApiResponse({ status: 200, type: FaqSuggestionsResponseDto })

	async listSuggestions(

		@Query() query: FaqSuggestionsQueryDto,

		@CurrentUser() user: any,

	): Promise<FaqSuggestionsResponseDto> {

		const organizationId = this.getOrganizationId(user);

		const suggestions = await this.faqEntryService.getSuggestionsForOrganization(

			organizationId,

			query.context,

			query.limit ?? 4,

		);

		return {

			success: true,

			count: suggestions.length,

			suggestions,

		};

	}



	@Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.USER)

	@AllowSdkScopes('faq:search')

	@AllowDashboardJwtOnSdkRoute()

	@RequireSdkScopes('faq:search')

	@Post('entries/:id/track-view')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Increment FAQ entry view count (SDK usage tracking)' })

	@ApiParam({ name: 'id', type: String, format: 'uuid' })

	@ApiResponse({ status: 200, type: FaqUsageTrackResponseDto })

	async trackView(

		@Param('id', ParseUUIDPipe) id: string,

		@CurrentUser() user: any,

	): Promise<FaqUsageTrackResponseDto> {

		const organizationId = this.getOrganizationId(user);

		await this.faqEntryService.trackView(id, organizationId);

		return { success: true };

	}



	@Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.USER)

	@AllowSdkScopes('faq:search')

	@AllowDashboardJwtOnSdkRoute()

	@RequireSdkScopes('faq:search')

	@Post('entries/:id/track-feedback')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Record helpful / not helpful feedback for a FAQ entry' })

	@ApiParam({ name: 'id', type: String, format: 'uuid' })

	@ApiResponse({ status: 200, type: FaqUsageTrackResponseDto })

	async trackFeedback(

		@Param('id', ParseUUIDPipe) id: string,

		@Body() body: FaqUsageFeedbackDto,

		@CurrentUser() user: any,

	): Promise<FaqUsageTrackResponseDto> {

		const organizationId = this.getOrganizationId(user);

		await this.faqEntryService.trackFeedback(id, organizationId, body.helpful);

		return { success: true };

	}



	@Roles(UserRole.ADMIN, UserRole.DEVELOPER)

	@Get('index-status')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'FAQ semantic index status for the current organization' })

	@ApiResponse({ status: 200, type: FaqIndexStatusResponseDto })

	async getIndexStatus(@CurrentUser() user: any): Promise<FaqIndexStatusResponseDto> {

		const organizationId = this.getOrganizationId(user);

		const status = await this.faqEntryService.getIndexStatus(organizationId);

		return {

			success: true,

			...status,

		};

	}



	@Roles(UserRole.ADMIN, UserRole.DEVELOPER, UserRole.USER)

	@AllowSdkScopes('faq:search')

	@AllowDashboardJwtOnSdkRoute()

	@RequireSdkScopes('faq:search')

	@Post('semantic-search')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({

		summary: 'Semantic FAQ search',

		description:

			'Returns the most relevant FAQ answers for a natural-language question using cosine similarity over sentence embeddings. Scoped to the caller organization when entries exist.',

	})

	@ApiBody({ type: SemanticSearchRequestDto })

	@ApiResponse({

		status: 200,

		description: 'Semantic search completed successfully',

		type: SemanticSearchResponseDto,

	})

	@ApiResponse({ status: 403, description: 'Access denied' })

	async semanticSearch(

		@Body() request: SemanticSearchRequestDto,

		@CurrentUser() user: any,

	): Promise<SemanticSearchResponseDto> {

		const organizationId = this.getOrganizationId(user);

		return this.faqService.semanticSearch(request, organizationId);

	}



	@Roles(UserRole.ADMIN, UserRole.DEVELOPER)

	@Get('manage')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'List FAQ entries for the current organization (dashboard)' })

	@ApiResponse({ status: 200, type: FaqManageListResponseDto })

	async listManage(@CurrentUser() user: any): Promise<FaqManageListResponseDto> {

		const organizationId = this.getOrganizationId(user);

		const actorId = this.getActorId(user);

		const items = await this.faqEntryService.listForOrganization(organizationId, actorId);

		return {

			success: true,

			count: items.length,

			items,

		};

	}



	@Roles(UserRole.ADMIN)

	@Post('entries')

	@HttpCode(HttpStatus.CREATED)

	@ApiOperation({ summary: 'Create a FAQ entry for the current organization' })

	async createEntry(@Body() dto: CreateFaqEntryDto, @CurrentUser() user: any) {

		const organizationId = this.getOrganizationId(user);

		const item = await this.faqEntryService.create(organizationId, dto);

		return {

			success: true,

			message: 'Entree FAQ creee',

			item,

		};

	}



	@Roles(UserRole.ADMIN)

	@Put('entries/:id')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Update a FAQ entry' })

	@ApiParam({ name: 'id', type: String, format: 'uuid' })

	async updateEntry(

		@Param('id', ParseUUIDPipe) id: string,

		@Body() dto: UpdateFaqEntryDto,

		@CurrentUser() user: any,

	) {

		const organizationId = this.getOrganizationId(user);

		const actorId = this.getActorId(user);

		const item = await this.faqEntryService.update(id, organizationId, dto, actorId);

		return {

			success: true,

			message: 'Entree FAQ mise a jour',

			item,

		};

	}



	@Roles(UserRole.ADMIN)

	@Put('entries/:id/publish')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Publish or unpublish a FAQ entry' })

	@ApiParam({ name: 'id', type: String, format: 'uuid' })

	async setEntryActive(

		@Param('id', ParseUUIDPipe) id: string,

		@Body() dto: SetFaqEntryActiveDto,

		@CurrentUser() user: any,

	) {

		const organizationId = this.getOrganizationId(user);

		const actorId = this.getActorId(user);

		const item = await this.faqEntryService.setActive(id, organizationId, dto.isActive, actorId);

		return {

			success: true,

			message: dto.isActive ? 'Entree FAQ publiee' : 'Entree FAQ depubliee',

			item,

		};

	}



	@Roles(UserRole.ADMIN)

	@Delete('entries/:id')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Delete a FAQ entry' })

	@ApiParam({ name: 'id', type: String, format: 'uuid' })

	async deleteEntry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {

		const organizationId = this.getOrganizationId(user);

		const actorId = this.getActorId(user);

		await this.faqEntryService.remove(id, organizationId, actorId);

		return {

			success: true,

			message: 'Entree FAQ supprimee',

		};

	}



	@Roles(UserRole.ADMIN)

	@Delete('manage/all')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Delete all FAQ entries for the current organization' })

	@ApiResponse({ status: 200, type: FaqClearAllResponseDto })

	async deleteAllEntries(@CurrentUser() user: any): Promise<FaqClearAllResponseDto> {

		const organizationId = this.getOrganizationId(user);

		const deleted = await this.faqEntryService.removeAllForOrganization(organizationId);

		return {

			success: true,

			message:

				deleted > 0

					? `${deleted} entree(s) FAQ supprimee(s)`

					: 'Aucune entree FAQ a supprimer',

			deleted,

		};

	}



	@Roles(UserRole.ADMIN)

	@Post('entries/:id/edit-lock/acquire')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Acquire FAQ entry edit lock (admin concurrency)' })

	@ApiParam({ name: 'id', type: String, format: 'uuid' })

	async acquireEntryEditLock(

		@Param('id', ParseUUIDPipe) id: string,

		@CurrentUser() user: any,

	) {

		const organizationId = this.getOrganizationId(user);

		const actorId = this.getActorId(user);

		const result = await this.faqEntryService.acquireFaqEditLock(id, organizationId, actorId);

		return {

			success: true,

			item: result.item,

			editLock: result.editLock,

		};

	}



	@Roles(UserRole.ADMIN)

	@Post('entries/:id/edit-lock/renew')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Renew FAQ entry edit lock TTL' })

	@ApiParam({ name: 'id', type: String, format: 'uuid' })

	async renewEntryEditLock(

		@Param('id', ParseUUIDPipe) id: string,

		@CurrentUser() user: any,

	) {

		const organizationId = this.getOrganizationId(user);

		const actorId = this.getActorId(user);

		const result = await this.faqEntryService.renewFaqEditLock(id, organizationId, actorId);

		return {

			success: true,

			item: result.item,

			editLock: result.editLock,

		};

	}



	@Roles(UserRole.ADMIN)

	@Delete('entries/:id/edit-lock')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Release FAQ entry edit lock' })

	@ApiParam({ name: 'id', type: String, format: 'uuid' })

	async releaseEntryEditLock(

		@Param('id', ParseUUIDPipe) id: string,

		@CurrentUser() user: any,

	) {

		const organizationId = this.getOrganizationId(user);

		const actorId = this.getActorId(user);

		await this.faqEntryService.releaseFaqEditLock(id, organizationId, actorId);

		return {

			success: true,

			message: 'Verrou d edition FAQ libere',

		};

	}



	@Roles(UserRole.ADMIN)

	@Post('reindex')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Rebuild semantic embeddings for the organization FAQ corpus' })

	@ApiResponse({ status: 200, type: FaqReindexResponseDto })

	async reindex(@CurrentUser() user: any): Promise<FaqReindexResponseDto> {

		const organizationId = this.getOrganizationId(user);

		const activeItems = await this.faqEntryService.listActiveForOrganization(organizationId);

		try {

			const embeddingsPath = await this.faqEntryService.rebuildEmbeddings(organizationId);

			return {

				success: true,

				message: 'Index semantique FAQ regenere',

				embeddedCount: activeItems.length,

				embeddingsPath,

			};

		} catch (error) {

			if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {

				throw error;

			}

			throw new InternalServerErrorException(

				`Echec de la regeneration de l'index FAQ: ${(error as Error).message}`,

			);

		}

	}



	@Roles(UserRole.ADMIN)

	@Post('import-global')

	@HttpCode(HttpStatus.OK)

	@ApiOperation({ summary: 'Import generic end-user FAQ starter catalog into the current organization' })

	@ApiResponse({ status: 200, type: FaqImportGlobalResponseDto })

	async importGlobal(@Body() dto: ImportGlobalFaqDto, @CurrentUser() user: any): Promise<FaqImportGlobalResponseDto> {

		const organizationId = this.getOrganizationId(user);

		const result = await this.faqEntryService.importGlobalCatalog(organizationId, {

			skipDuplicates: dto.skipDuplicates,

			replaceExisting: dto.replaceExisting,

		});

		return {

			success: true,

			message: `${result.imported} entree(s) importee(s) depuis le catalogue TrustDev`,

			imported: result.imported,

			skipped: result.skipped,

			totalInCatalog: result.totalInCatalog,

		};

	}

}



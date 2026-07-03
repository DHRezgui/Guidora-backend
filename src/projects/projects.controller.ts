import {

  BadRequestException,

  Body,

  Controller,

  Delete,

  Get,

  HttpCode,

  HttpStatus,

  Param,

  UseGuards,

} from '@nestjs/common';

import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { Roles } from '../auth/decorators/roles.decorator';

import { RolesGuard } from '../auth/guards/roles.guard';

import { ApiAuth } from '../swagger/security-schemas';

import { UserRole } from '../user/entities/user.entity';

import {

  DeleteProjectScopeDto,

  DeleteProjectScopeResponseDto,

  ProjectDeleteScopePreviewResponseDto,

  ProjectListResponseDto,

  ProjectOverviewResponseDto,

} from './dto/projects.dto';

import { ProjectsService } from './projects.service';



@ApiTags('Projects')

@ApiAuth()

@UseGuards(RolesGuard)

@Controller('projects')

export class ProjectsController {

  constructor(private readonly projectsService: ProjectsService) {}



  private getOrganizationId(user: { organizationId?: string; organizations?: Array<{ id: string }> }): string {

    const organizationId = user?.organizationId || user?.organizations?.[0]?.id;

    if (!organizationId) {

      throw new BadRequestException('Aucune organisation associée à cet utilisateur.');

    }

    return organizationId;

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @Get()

  @HttpCode(HttpStatus.OK)

  @ApiOperation({ summary: 'List SDK projects with FAQ, tour and blueprint counts' })

  @ApiResponse({ status: 200, type: ProjectListResponseDto })

  async list(@CurrentUser() user: any): Promise<ProjectListResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const { projects } = await this.projectsService.listForOrganization(organizationId, user);

    return { success: true, projects };

  }



  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)

  @Get(':projectKey/overview')

  @HttpCode(HttpStatus.OK)

  @ApiOperation({ summary: 'Project hub overview (FAQ, tours, blueprints)' })

  @ApiParam({ name: 'projectKey', description: 'SDK flowVersion / project key' })

  @ApiResponse({ status: 200, type: ProjectOverviewResponseDto })

  async overview(

    @Param('projectKey') projectKey: string,

    @CurrentUser() user: any,

  ): Promise<ProjectOverviewResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const overview = await this.projectsService.getOverview(organizationId, projectKey, user);

    return { success: true, ...overview };

  }



  @Roles(UserRole.ADMIN)

  @Get(':projectKey/delete-scope-preview')

  @HttpCode(HttpStatus.OK)

  @ApiOperation({

    summary: 'Preview full project scope deletion (FAQ + tours + blueprints)',

  })

  @ApiParam({ name: 'projectKey', description: 'SDK flowVersion / project key' })

  @ApiResponse({ status: 200, type: ProjectDeleteScopePreviewResponseDto })

  async deleteScopePreview(

    @Param('projectKey') projectKey: string,

    @CurrentUser() user: any,

  ): Promise<ProjectDeleteScopePreviewResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const preview = await this.projectsService.getDeleteScopePreview(organizationId, projectKey, user);

    return { success: true, ...preview };

  }



  @Roles(UserRole.ADMIN)

  @Delete(':projectKey/scope')

  @HttpCode(HttpStatus.OK)

  @ApiOperation({

    summary: 'Delete full SDK project scope (FAQ pack + scoped tours + blueprints)',

    description:

      'Strict scope deletion. Lab SDK tours are skipped. Production tours block deletion. `default` and lab project keys are forbidden.',

  })

  @ApiParam({ name: 'projectKey', description: 'SDK flowVersion / project key' })

  @ApiBody({ type: DeleteProjectScopeDto })

  @ApiResponse({ status: 200, type: DeleteProjectScopeResponseDto })

  async deleteScope(

    @Param('projectKey') projectKey: string,

    @Body() body: DeleteProjectScopeDto,

    @CurrentUser() user: any,

  ): Promise<DeleteProjectScopeResponseDto> {

    const organizationId = this.getOrganizationId(user);

    const result = await this.projectsService.deleteProjectScope(

      organizationId,

      projectKey,

      body.confirmProjectKey,

      user,

    );

    const parts = [

      result.faqDeleted > 0 ? `${result.faqDeleted} FAQ` : null,

      result.toursDeleted > 0 ? `${result.toursDeleted} parcours` : null,

      result.blueprintsDeleted > 0 ? `${result.blueprintsDeleted} blueprint(s)` : null,

    ].filter(Boolean);

    const message =

      parts.length > 0

        ? `Scope ${result.projectKey} supprimé — ${parts.join(', ')}`

        : `Scope ${result.projectKey} supprimé`;

    return {

      success: true,

      ...result,

      message,

    };

  }

}



import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { FaqEntryService } from '../faq/faq-entry.service';
import { DEFAULT_FAQ_PROJECT_KEY, normalizeFaqProjectKey } from '../faq/faq-project-key.util';
import { GuidedTourService } from '../guided-tour/guided-tour.service';
import { ContextualJourneyBlueprintService } from '../guided-tour/contextual-journey-blueprint.service';
import type { BlueprintPermissionActor } from '../guided-tour/blueprint-permissions.util';
import type { RequestAuthUser } from '../auth/types/request-auth-user.type';
import { isSdkLabPublishedTour } from '../guided-tour/guided-tour-lab.util';
import { isTourProductionDeployment } from '../guided-tour/guided-tour-permissions.util';
import {
  assertDeletableProjectScopeKey,
  assertProjectScopeDeleteConfirmation,
} from './project-scope-delete.util';

const RECENT_LIMIT = 5;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly faqEntryService: FaqEntryService,
    private readonly guidedTourService: GuidedTourService,
    private readonly blueprintService: ContextualJourneyBlueprintService,
  ) {}

  async listForOrganization(organizationId: string, actor?: RequestAuthUser) {
    const [faqProjectKeys, faqCounts, tourCounts, blueprintCounts] = await Promise.all([
      this.faqEntryService.listProjectKeysForOrganization(organizationId),
      this.faqEntryService.listProjectKeyCounts(organizationId),
      this.guidedTourService.listVisibleProjectKeyTourCounts(organizationId, actor),
      this.blueprintService.listProjectKeyBlueprintCounts(organizationId),
    ]);

    const projectKeys = [
      ...new Set([
        ...faqProjectKeys,
        ...Object.keys(tourCounts),
        ...Object.keys(blueprintCounts),
      ]),
    ].sort((a, b) => {
      if (a === DEFAULT_FAQ_PROJECT_KEY) return -1;
      if (b === DEFAULT_FAQ_PROJECT_KEY) return 1;
      return a.localeCompare(b);
    });

    const projects = projectKeys.map((projectKey) => ({
      projectKey,
      faqCount: faqCounts[projectKey] ?? 0,
      tourCount: tourCounts[projectKey] ?? 0,
      blueprintCount: blueprintCounts[projectKey] ?? 0,
    }));

    return { projects };
  }

  async getOverview(organizationId: string, rawProjectKey: string, actor?: RequestAuthUser) {
    const projectKey = normalizeFaqProjectKey(rawProjectKey);
    const actorId = actor?.id;
    const blueprintActor =
      actor?.role === 'SDK_TOKEN' ? undefined : (actor as BlueprintPermissionActor | undefined);
    const flowVersionFilter = projectKey;

    const [faqItems, tours, blueprints, indexStatus] = await Promise.all([
      this.faqEntryService.listForOrganization(organizationId, actorId, projectKey),
      this.guidedTourService.findAllByOrganization(
        organizationId,
        actor,
        undefined,
        false,
        flowVersionFilter,
      ),
      this.blueprintService.listForOrganization(organizationId, blueprintActor, projectKey),
      this.faqEntryService.getIndexStatus(organizationId, projectKey).catch(() => null),
    ]);

    const recentFaqItems = faqItems.slice(0, RECENT_LIMIT);
    const recentTours = tours.slice(0, RECENT_LIMIT).map((tour) => ({
      id: tour.id,
      name: tour.name,
      targetUrl: tour.targetUrl,
      isActive: tour.isActive,
      isSandboxTestActive: tour.isSandboxTestActive,
      environment: tour.environment,
      sandboxStatus: tour.sandboxStatus,
      stepCount: (tour as { stepCount?: number }).stepCount,
      createdAt: tour.createdAt,
      updatedAt: tour.updatedAt,
      createdBy: tour.createdBy,
      assignedAdminIds: tour.assignedAdminIds,
      inCollaboration: tour.inCollaboration,
      accessGrants: tour.accessGrants,
      triggerConditions: tour.triggerConditions,
      developerPrivate: tour.developerPrivate,
      sandboxRejectionReason: tour.sandboxRejectionReason,
      sharingHasView: tour.sharingHasView,
      sharingHasCollaborate: tour.sharingHasCollaborate,
      sandboxRejectedBy: tour.sandboxRejectedBy,
    }));
    const recentBlueprints = blueprints.slice(0, RECENT_LIMIT).map((row) => ({
      id: row.id,
      blueprintId: row.blueprintId,
      vertical: row.vertical,
      isPublished: row.isPublished,
      name: String((row.payload?.name as string | undefined) ?? row.blueprintId),
      updatedAt: row.updatedAt,
    }));

    return {
      projectKey,
      faqCount: faqItems.length,
      tourCount: tours.length,
      blueprintCount: blueprints.length,
      recentFaqItems,
      recentTours,
      recentBlueprints,
      indexStatus: indexStatus
        ? {
            activeCount: indexStatus.activeCount,
            embeddingsReady: indexStatus.embeddingsReady,
            needsReindex: indexStatus.needsReindex,
            lastIndexedAt: indexStatus.lastIndexedAt ?? null,
          }
        : null,
    };
  }

  async getDeleteScopePreview(
    organizationId: string,
    rawProjectKey: string,
    actor?: RequestAuthUser,
  ) {
    const projectKey = assertDeletableProjectScopeKey(rawProjectKey);
    const blueprintActor =
      actor?.role === 'SDK_TOKEN' ? undefined : (actor as BlueprintPermissionActor | undefined);

    const [faqItems, tours, blueprints] = await Promise.all([
      this.faqEntryService.listForOrganization(organizationId, actor?.id, projectKey),
      this.guidedTourService.findAllByOrganization(
        organizationId,
        actor,
        undefined,
        false,
        projectKey,
      ),
      this.blueprintService.listForOrganization(organizationId, blueprintActor, projectKey),
    ]);

    const scopedTours = tours.filter((tour) => !isSdkLabPublishedTour(tour));
    const labTourSkippedCount = tours.length - scopedTours.length;
    const productionTours = scopedTours
      .filter((tour) => isTourProductionDeployment(tour))
      .map((tour) => ({ id: tour.id, name: tour.name }));
    const lockedBlueprints = blueprints
      .filter(
        (row) =>
          Boolean(row.editLock?.required) &&
          Boolean(row.editLock?.heldByUserId) &&
          !row.editLock?.isHeldByMe,
      )
      .map((row) => ({
        id: row.id,
        blueprintId: row.blueprintId,
        heldByDisplayName: row.editLock?.heldByDisplayName ?? undefined,
      }));

    let canDelete = true;
    let blockReason: string | undefined;

    if (productionTours.length > 0) {
      canDelete = false;
      blockReason =
        productionTours.length === 1
          ? '1 parcours est encore en production. Repassez-le en sandbox avant de supprimer le scope projet.'
          : `${productionTours.length} parcours sont encore en production. Repassez-les en sandbox avant de supprimer le scope projet.`;
    } else if (lockedBlueprints.length > 0) {
      canDelete = false;
      blockReason =
        lockedBlueprints.length === 1
          ? '1 blueprint est en cours d’édition par un autre collaborateur.'
          : `${lockedBlueprints.length} blueprints sont en cours d’édition par d’autres collaborateurs.`;
    }

    const totalDeletable =
      faqItems.length + scopedTours.length + blueprints.length;

    return {
      projectKey,
      faqCount: faqItems.length,
      tourCount: scopedTours.length,
      blueprintCount: blueprints.length,
      labTourSkippedCount,
      productionTours,
      lockedBlueprints,
      canDelete,
      blockReason,
      isEmpty: totalDeletable === 0 && labTourSkippedCount === 0,
    };
  }

  async deleteProjectScope(
    organizationId: string,
    rawProjectKey: string,
    confirmProjectKey: string,
    actor?: RequestAuthUser,
  ) {
    const projectKey = assertDeletableProjectScopeKey(rawProjectKey);
    assertProjectScopeDeleteConfirmation(projectKey, confirmProjectKey);

    const preview = await this.getDeleteScopePreview(organizationId, projectKey, actor);
    if (!preview.canDelete) {
      throw new ConflictException(preview.blockReason ?? 'Suppression du scope projet impossible.');
    }

    const blueprintActor =
      actor?.role === 'SDK_TOKEN' ? undefined : (actor as BlueprintPermissionActor | undefined);

    const [tours, blueprints] = await Promise.all([
      this.guidedTourService.findAllByOrganization(
        organizationId,
        actor,
        undefined,
        false,
        projectKey,
      ),
      this.blueprintService.listForOrganization(organizationId, blueprintActor, projectKey),
    ]);

    const scopedTours = tours.filter((tour) => !isSdkLabPublishedTour(tour));

    let faqDeleted = 0;
    try {
      faqDeleted = await this.faqEntryService.deleteProjectPack(organizationId, projectKey);
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        preview.faqCount === 0
      ) {
        faqDeleted = 0;
      } else {
        throw error;
      }
    }

    for (const tour of scopedTours) {
      await this.guidedTourService.delete(tour.id, organizationId, actor);
    }

    for (const blueprint of blueprints) {
      if (!blueprintActor?.id) {
        throw new BadRequestException('Utilisateur requis pour supprimer les blueprints du projet.');
      }
      await this.blueprintService.remove(blueprint.id, organizationId, blueprintActor);
    }

    return {
      projectKey,
      faqDeleted,
      toursDeleted: scopedTours.length,
      blueprintsDeleted: blueprints.length,
      labToursSkipped: preview.labTourSkippedCount,
    };
  }
}

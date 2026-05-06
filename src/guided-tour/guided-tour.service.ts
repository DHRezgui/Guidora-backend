import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { GuidedTour, TourReplayPolicy } from './entities/guided-tour.entity';
import { TourUserState, TourUserStateStatus } from './entities/tour-user-state.entity';
import { Step } from '../step/entities/step.entity';
import { User } from '../user/entities/user.entity';
import { CreateGuidedTourDto } from './dto/create-guided-tour.dto';
import { UpdateGuidedTourDto } from './dto/update-guided-tour.dto';
import { ResetTourSegmentDto, TourResetSegment } from './dto/reset-tour-segment.dto';
import { OrganizationService } from '../organization/organization.service';
import {
  ContextualDraftStepDto,
  ContextualScenario,
  ContextualSuggestedDraftDto,
  PublishContextualDraftsDto,
} from './dto/publish-contextual-drafts.dto';
import { ActionType, PositionType, StepType } from '../step/enums/tour.enums';

type ScenarioThreshold = {
  minConfidence: number;
  minScore: number;
  minStableSteps: number;
  activationConfidence: number;
};

type ContextualEngineMeta = {
  source?: string;
  status?: 'pending_review' | 'active';
  scenario?: ContextualScenario;
  intent?: string;
  confidence?: number;
  score?: number;
  flowVersion?: string;
  flowSignature?: string;
  version?: number;
};

type ActivationPolicyDecision = {
  requestedAutoActivate: boolean;
  effectiveAutoActivate: boolean;
  mode: 'auto' | 'manual_review';
  reason: 'allowed' | 'production_guard';
  environment: string;
};

@Injectable()
export class GuidedTourService {
  private readonly scenarioThresholds: Record<ContextualScenario, ScenarioThreshold> = {
    [ContextualScenario.SIMPLE]: {
      minConfidence: 40,
      minScore: 45,
      minStableSteps: 1,
      activationConfidence: 65,
    },
    [ContextualScenario.MEDIUM]: {
      minConfidence: 56,
      minScore: 72,
      minStableSteps: 2,
      activationConfidence: 68,
    },
    [ContextualScenario.DYNAMIC]: {
      minConfidence: 60,
      minScore: 82,
      minStableSteps: 1,
      activationConfidence: 70,
    },
    [ContextualScenario.STRESS]: {
      minConfidence: 63,
      minScore: 85,
      minStableSteps: 2,
      activationConfidence: 73,
    },
  };

  constructor(
    @InjectRepository(GuidedTour)
    private tourRepository: Repository<GuidedTour>,
    @InjectRepository(TourUserState)
    private tourUserStateRepository: Repository<TourUserState>,
    @InjectRepository(Step)
    private stepRepository: Repository<Step>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private organizationService: OrganizationService,
  ) {}

  async publishContextualDrafts(
    dto: PublishContextualDraftsDto,
    organizationId: string,
    createdBy?: string,
  ): Promise<{
    processed: number;
    created: number;
    activated: number;
    rejected: number;
    skipped: number;
    details: Array<{ draftName: string; outcome: 'created' | 'activated' | 'rejected' | 'skipped'; reasons: string[]; tourId?: string }>;
    monitoring: {
      environment: string;
      activationPolicyMode: 'auto' | 'manual_review';
      reasonsBreakdown: Record<string, number>;
      postPublishChecks: string[];
    };
  }> {
    await this.organizationService.findById(organizationId);

    const threshold = this.scenarioThresholds[dto.scenario];
    const activationPolicy = this.resolveActivationPolicy(dto.autoActivate ?? true);
    const targetUrls = [...new Set(dto.drafts.map((draft) => draft.targetUrl).filter(Boolean))];

    const existingTours = targetUrls.length
      ? await this.tourRepository.find({
          where: { organizationId, targetUrl: In(targetUrls) },
          relations: ['steps'],
        })
      : [];

    const dedupeSet = new Set<string>();
    for (const tour of existingTours) {
      const engineMeta = this.getContextualMeta(tour);
      if (!engineMeta?.intent || !engineMeta?.flowSignature) {
        continue;
      }
      dedupeSet.add(this.buildDedupeKey(tour.targetUrl, engineMeta.intent, engineMeta.flowSignature));
    }

    const details: Array<{ draftName: string; outcome: 'created' | 'activated' | 'rejected' | 'skipped'; reasons: string[]; tourId?: string }> = [];
    let created = 0;
    let activated = 0;
    let rejected = 0;
    let skipped = 0;

    for (const draft of dto.drafts) {
      const reasons: string[] = [];
      const intent = draft.intent ?? 'discovery';
      const flowSignature = draft.flowVersioning?.flowSignature;

      if (!flowSignature) {
        reasons.push('missing_flow_signature');
      }

      if (!this.isScenarioConsistentWithTargetUrl(dto.scenario, draft.targetUrl)) {
        reasons.push('scenario_target_mismatch');
      }

      const quality = this.evaluateDraftQuality(draft, dto.scenario, threshold);
      reasons.push(...quality.reasons);

      if (reasons.length > 0) {
        rejected += 1;
        details.push({ draftName: draft.name, outcome: 'rejected', reasons });
        continue;
      }

      const dedupeKey = this.buildDedupeKey(draft.targetUrl, intent, flowSignature);
      if (dedupeSet.has(dedupeKey)) {
        skipped += 1;
        details.push({ draftName: draft.name, outcome: 'skipped', reasons: ['duplicate_signature'] });
        continue;
      }

      const version = this.computeNextVersion(existingTours, draft.targetUrl, intent);
      const shouldActivate =
        activationPolicy.effectiveAutoActivate &&
        draft.confidence >= threshold.activationConfidence &&
        draft.score >= threshold.minScore &&
        quality.primaryStable &&
        !quality.hasCriticalConflict &&
        quality.intentTargetCoherent;

      const outcomeReasons = shouldActivate
        ? ['auto_activated']
        : [
            activationPolicy.effectiveAutoActivate ? 'saved_pending_review' : 'saved_pending_review_policy_guard',
            ...(activationPolicy.effectiveAutoActivate ? [] : ['auto_activation_disabled_by_policy']),
          ];

      const tour = await this.create(
        {
          name: draft.name,
          description: draft.description,
          targetUrl: draft.targetUrl,
          isActive: shouldActivate,
          priority: Math.max(0, Math.round(draft.score)),
          triggerConditions: {
            source: 'contextual-engine',
            contextualEngine: {
              source: 'contextual-engine',
              status: shouldActivate ? 'active' : 'pending_review',
              scenario: dto.scenario,
              intent,
              confidence: draft.confidence,
              score: draft.score,
              flowVersion: draft.flowVersioning.flowVersion,
              flowSignature,
              version,
              activationPolicy: {
                mode: activationPolicy.mode,
                reason: activationPolicy.reason,
                requestedAutoActivate: activationPolicy.requestedAutoActivate,
                effectiveAutoActivate: activationPolicy.effectiveAutoActivate,
                environment: activationPolicy.environment,
              },
              explainability: draft.explainability ?? {},
              diagnostics: draft.diagnostics ?? {},
              metadata: draft.metadata ?? {},
              persistedAt: new Date().toISOString(),
            },
          },
          simulationContext: this.extractSimulationContext(draft.metadata),
          steps: draft.steps.map((step) => ({
            title: step.title,
            content: step.content,
            targetSelector: step.targetSelector,
            stepTargetUrl: step.stepTargetUrl,
            position: this.normalizePosition(step.position),
            action: this.normalizeAction(step.action),
            skipAllowed: step.skipAllowed ?? true,
            highlightElement: step.highlightElement ?? true,
            stepType: this.normalizeStepType(step.stepType),
          })),
        },
        organizationId,
        createdBy,
      );

      created += 1;
      if (shouldActivate) {
        activated += 1;
      }

      details.push({
        draftName: draft.name,
        outcome: shouldActivate ? 'activated' : 'created',
        reasons: outcomeReasons,
        tourId: tour.id,
      });

      dedupeSet.add(dedupeKey);
      existingTours.push(tour);
    }

    return {
      processed: dto.drafts.length,
      created,
      activated,
      rejected,
      skipped,
      details,
      monitoring: {
        environment: activationPolicy.environment,
        activationPolicyMode: activationPolicy.mode,
        reasonsBreakdown: this.buildReasonsBreakdown(details),
        postPublishChecks: [
          'Monitor activation and completion rates over 24h.',
          'Review rejected reasons and tune thresholds before broad rollout.',
          'Sample top 3 activated tours and validate step selectors still resolve.',
        ],
      },
    };
  }

  private evaluateDraftQuality(
    draft: ContextualSuggestedDraftDto,
    scenario: ContextualScenario,
    threshold: ScenarioThreshold,
  ): {
    reasons: string[];
    hasCriticalConflict: boolean;
    primaryStable: boolean;
    intentTargetCoherent: boolean;
  } {
    const reasons: string[] = [];
    const steps = draft.steps ?? [];

    if (steps.length < 1) {
      reasons.push('no_steps_provided');
    }

    if (draft.confidence < threshold.minConfidence) {
      reasons.push('confidence_below_threshold');
    }

    if (draft.score < threshold.minScore) {
      reasons.push('score_below_threshold');
    }

    const hasMissingSelector = steps.some((step) => !step.targetSelector || !step.targetSelector.trim());
    if (hasMissingSelector) {
      reasons.push('missing_target_selector');
    }

    const primaryStep = this.pickPrimaryStep(steps);
    const primarySelector = primaryStep?.targetSelector;
    const primaryStable = this.isStableSelector(primarySelector);
    const primaryFragile = this.isFragileSelector(primarySelector);

    if (primaryFragile && !primaryStable) {
      reasons.push('primary_selector_fragile_only');
    }

    const isPrimaryIntent = (draft.intent ?? '').toLowerCase() === 'primary-action';
    const intentTargetCoherent = !isPrimaryIntent || this.isActionableSelector(primarySelector);
    if (!intentTargetCoherent) {
      reasons.push('primary_intent_not_actionable');
    }

    const stableSteps = steps.filter((step) => this.isStableSelector(step.targetSelector)).length;
    if (stableSteps < threshold.minStableSteps) {
      reasons.push('stable_selector_coverage_too_low');
    }

    if (scenario === ContextualScenario.DYNAMIC || scenario === ContextualScenario.STRESS) {
      const rejectedNoise = this.extractRejectedNoiseMetric(draft);
      if (rejectedNoise !== undefined && rejectedNoise <= 0) {
        reasons.push('dynamic_noise_robustness_failed');
      }
      if (!primaryStable) {
        reasons.push('dynamic_primary_not_stable');
      }
    }

    const hasCriticalConflict = this.hasCriticalConflict(draft);
    if (hasCriticalConflict) {
      reasons.push('critical_conflict_unresolved');
    }

    return {
      reasons,
      hasCriticalConflict,
      primaryStable,
      intentTargetCoherent,
    };
  }

  private pickPrimaryStep(steps: ContextualDraftStepDto[]): ContextualDraftStepDto | undefined {
    return (
      steps.find((step) => step.isPrimary) ??
      steps.find((step) => (step.intent ?? '').toLowerCase() === 'primary-action') ??
      steps[0]
    );
  }

  private isStableSelector(selector?: string): boolean {
    if (!selector) {
      return false;
    }
    return /data-tour-id|data-testid/i.test(selector);
  }

  private isFragileSelector(selector?: string): boolean {
    if (!selector) {
      return false;
    }
    return /:nth-of-type\(|:nth-child\(/i.test(selector);
  }

  private isActionableSelector(selector?: string): boolean {
    if (!selector) {
      return false;
    }
    return /(button|\[role=["']button["']\]|a\[|input\[type=["']submit["']\]|input\[type=["']button["']\])/i.test(
      selector,
    );
  }

  private extractRejectedNoiseMetric(draft: ContextualSuggestedDraftDto): number | undefined {
    const candidates: unknown[] = [
      draft.diagnostics?.rejectedNoise,
      draft.metadata?.rejectedNoise,
      draft.explainability?.rejectedNoise,
      (draft.diagnostics?.generationMetrics as Record<string, unknown> | undefined)?.rejectedNoise,
      (draft.metadata?.generationMetrics as Record<string, unknown> | undefined)?.rejectedNoise,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private hasCriticalConflict(draft: ContextualSuggestedDraftDto): boolean {
    const candidates: unknown[] = [
      draft.diagnostics?.hasCriticalConflict,
      draft.metadata?.hasCriticalConflict,
      draft.explainability?.hasCriticalConflict,
      (draft.diagnostics?.conflicts as Record<string, unknown> | undefined)?.critical,
      (draft.metadata?.conflicts as Record<string, unknown> | undefined)?.critical,
      (draft.explainability?.conflicts as Record<string, unknown> | undefined)?.critical,
    ];

    return candidates.some((value) => value === true || (typeof value === 'number' && value > 0));
  }

  private extractSimulationContext(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
    const previewContext = metadata?.previewContext;
    if (!previewContext || typeof previewContext !== 'object') {
      return undefined;
    }

    return previewContext as Record<string, unknown>;
  }

  private normalizePosition(position?: PositionType): PositionType {
    if (!position) {
      return PositionType.BOTTOM;
    }
    return PositionType[position] ? position : PositionType.BOTTOM;
  }

  private normalizeAction(action?: ActionType): ActionType {
    if (!action) {
      return ActionType.NEXT;
    }
    return ActionType[action] ? action : ActionType.NEXT;
  }

  private normalizeStepType(stepType?: StepType): StepType {
    if (!stepType) {
      return StepType.HIGHLIGHT;
    }
    return Object.values(StepType).includes(stepType) ? stepType : StepType.HIGHLIGHT;
  }

  private computeNextVersion(existingTours: GuidedTour[], targetUrl: string, intent: string): number {
    let maxVersion = 0;
    for (const tour of existingTours) {
      if (tour.targetUrl !== targetUrl) {
        continue;
      }
      const meta = this.getContextualMeta(tour);
      if (!meta || (meta.intent ?? 'discovery') !== intent) {
        continue;
      }
      if (typeof meta.version === 'number' && meta.version > maxVersion) {
        maxVersion = meta.version;
      }
    }
    return maxVersion + 1;
  }

  private buildDedupeKey(targetUrl: string, intent: string, flowSignature: string): string {
    return `${targetUrl}::${intent}::${flowSignature}`;
  }

  private getContextualMeta(tour: GuidedTour): ContextualEngineMeta | undefined {
    const triggerConditions = tour.triggerConditions as Record<string, unknown> | undefined;
    const contextualEngine = triggerConditions?.contextualEngine;
    if (!contextualEngine || typeof contextualEngine !== 'object') {
      return undefined;
    }
    return contextualEngine as ContextualEngineMeta;
  }

  private resolveActivationPolicy(requestedAutoActivate: boolean): ActivationPolicyDecision {
    const environment = process.env.NODE_ENV || 'development';
    const allowAutoActivateInProduction = process.env.CONTEXTUAL_PUBLISH_AUTO_ACTIVATE_IN_PROD === 'true';
    const productionGuardActive = environment === 'production' && !allowAutoActivateInProduction;
    const effectiveAutoActivate = requestedAutoActivate && !productionGuardActive;

    return {
      requestedAutoActivate,
      effectiveAutoActivate,
      mode: effectiveAutoActivate ? 'auto' : 'manual_review',
      reason: productionGuardActive ? 'production_guard' : 'allowed',
      environment,
    };
  }

  private isScenarioConsistentWithTargetUrl(scenario: ContextualScenario, targetUrl: string): boolean {
    const normalizedUrl = (targetUrl || '').toLowerCase();
    const expectedScenario = this.extractScenarioFromTargetUrl(normalizedUrl);
    if (!expectedScenario) {
      return true;
    }
    return expectedScenario === scenario;
  }

  private extractScenarioFromTargetUrl(targetUrl: string): ContextualScenario | null {
    if (!targetUrl.includes('/dashboard/sdk-tests/')) {
      return null;
    }
    if (targetUrl.includes('/dashboard/sdk-tests/simple')) return ContextualScenario.SIMPLE;
    if (targetUrl.includes('/dashboard/sdk-tests/medium')) return ContextualScenario.MEDIUM;
    if (targetUrl.includes('/dashboard/sdk-tests/dynamic')) return ContextualScenario.DYNAMIC;
    if (targetUrl.includes('/dashboard/sdk-tests/stress')) return ContextualScenario.STRESS;
    return null;
  }

  private buildReasonsBreakdown(
    details: Array<{ draftName: string; outcome: 'created' | 'activated' | 'rejected' | 'skipped'; reasons: string[]; tourId?: string }>,
  ): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const detail of details) {
      for (const reason of detail.reasons) {
        breakdown[reason] = (breakdown[reason] || 0) + 1;
      }
    }
    return breakdown;
  }

  // Créer un parcours avec ses étapes
  async create(createTourDto: CreateGuidedTourDto, organizationId: string, createdBy?: string): Promise<GuidedTour> {
    await this.organizationService.findById(organizationId);

    // Extraire les étapes du DTO pour éviter le cascade automatique
    const { steps: stepDtos, ...tourData } = createTourDto;

    // Créer le tour (sans les steps pour éviter cascade avec orderIndex null)
    const tour = this.tourRepository.create({
      ...tourData,
      organizationId,
      createdBy,
      triggerConditions: createTourDto.triggerConditions || {},
      simulationContext: createTourDto.simulationContext,
      replayPolicy: createTourDto.replayPolicy ?? TourReplayPolicy.NEVER,
      replayAfterDays: createTourDto.replayAfterDays ?? 0,
      currentResetVersion: 0,
    });

    // Sauvegarder le tour pour obtenir l'ID
    const savedTour = await this.tourRepository.save(tour);

    // Créer les étapes avec l'ID du tour et l'orderIndex
    const steps = stepDtos.map((stepDto, index) =>
      this.stepRepository.create({
        ...stepDto,
        tourId: savedTour.id,
        orderIndex: index + 1,
      }),
    );

    // Sauvegarder les étapes
    await this.stepRepository.save(steps);

    // Recharger le tour avec ses étapes
    return this.tourRepository.findOneOrFail({
      where: { id: savedTour.id },
      relations: ['steps'],
    });
  }

  // Lister les parcours d'une organisation
  async findAllByOrganization(organizationId: string, isActive?: boolean): Promise<GuidedTour[]> {
    const query = this.tourRepository
      .createQueryBuilder('tour')
      .leftJoinAndSelect('tour.steps', 'step')
      .where('tour.organization_id = :organizationId', { organizationId })
      .orderBy('tour.is_active', 'DESC')
      .addOrderBy('tour.priority', 'DESC')
      .addOrderBy('tour.createdAt', 'DESC');

    if (isActive !== undefined) {
      query.andWhere('tour.is_active = :isActive', { isActive });
    }

    return query.getMany();
  }

  // Trouver un parcours par ID avec validation d'organisation
  async findById(id: string, organizationId: string): Promise<GuidedTour> {
    const tour = await this.tourRepository.findOne({
      where: { id, organizationId },
      relations: ['steps', 'organization'],
    });

    if (!tour) {
      throw new NotFoundException(`Parcours introuvable ou vous n'avez pas les permissions`);
    }

    // Trier les étapes par ordre
    tour.steps.sort((a, b) => a.orderIndex - b.orderIndex);
    return tour;
  }

  // Mettre à jour un parcours
  async update(id: string, updateTourDto: UpdateGuidedTourDto, organizationId: string): Promise<GuidedTour> {
    const tour = await this.findById(id, organizationId);

    // Mettre à jour les champs simples
    if (updateTourDto.name !== undefined) tour.name = updateTourDto.name;
    if (updateTourDto.description !== undefined) tour.description = updateTourDto.description;
    if (updateTourDto.targetUrl !== undefined) tour.targetUrl = updateTourDto.targetUrl;
    if (updateTourDto.isActive !== undefined) tour.isActive = updateTourDto.isActive;
    if (updateTourDto.priority !== undefined) tour.priority = updateTourDto.priority;
    if (updateTourDto.triggerConditions !== undefined) {
      tour.triggerConditions = { ...tour.triggerConditions, ...updateTourDto.triggerConditions };
    }
    if (updateTourDto.simulationContext !== undefined) {
      tour.simulationContext = updateTourDto.simulationContext;
    }
    if (updateTourDto.replayPolicy !== undefined) {
      tour.replayPolicy = updateTourDto.replayPolicy;
    }
    if (updateTourDto.replayAfterDays !== undefined) {
      tour.replayAfterDays = Math.max(0, updateTourDto.replayAfterDays);
    }

    // Sauvegarder le tour mis à jour
    await this.tourRepository.save(tour);

    // Gérer les étapes si fournies
    if (updateTourDto.steps) {
      // Supprimer les anciennes étapes
      await this.stepRepository.delete({ tourId: id });

      // Créer les nouvelles étapes
      const newSteps = updateTourDto.steps.map((stepDto, index) =>
        this.stepRepository.create({
          ...stepDto,
          tourId: id,
          orderIndex: index + 1,
        }),
      );

      await this.stepRepository.save(newSteps);
    }

    return this.findById(id, organizationId);
  }

  // Supprimer un parcours (hard delete)
  async delete(id: string, organizationId: string): Promise<void> {
    const result = await this.tourRepository.delete({ id, organizationId });
    if (!result.affected) {
      throw new NotFoundException(`Parcours introuvable ou vous n'avez pas les permissions`);
    }
  }

  // Activer/désactiver un parcours
  async toggleActive(id: string, organizationId: string, isActive: boolean): Promise<GuidedTour> {
    const tour = await this.findById(id, organizationId);
    tour.isActive = isActive;
    return this.tourRepository.save(tour);
  }

  // Trouver les parcours actifs pour une URL cible
  async findActiveToursForUrl(url: string, organizationId: string, userId?: string): Promise<GuidedTour[]> {
    const tours = await this.tourRepository.find({
      where: {
        organizationId,
        targetUrl: url,
        isActive: true,
      },
      relations: ['steps'],
      order: { priority: 'DESC' },
    });

    if (!userId || tours.length === 0) {
      return tours;
    }

    const tourIds = tours.map((tour) => tour.id);
    const dismissedStates = await this.tourUserStateRepository.find({
      where: {
        organizationId,
        userId,
        tourId: In(tourIds),
      },
    });
    const blockedTourIdSet = new Set<string>();
    const now = new Date();
    for (const state of dismissedStates) {
      if (state.status !== TourUserStateStatus.DISMISSED && state.status !== TourUserStateStatus.COMPLETED) {
        continue;
      }
      const tour = tours.find((item) => item.id === state.tourId);
      if (!tour) {
        blockedTourIdSet.add(state.tourId);
        continue;
      }
      if (state.resetVersion < (tour.currentResetVersion || 0)) {
        continue;
      }
      if (tour.replayPolicy === TourReplayPolicy.ALWAYS_ON_NEW_VERSION) {
        blockedTourIdSet.add(state.tourId);
        continue;
      }
      if (tour.replayPolicy === TourReplayPolicy.AFTER_PERIOD) {
        const nextEligibleAt = state.nextEligibleAt
          ? new Date(state.nextEligibleAt)
          : this.computeNextEligibleAt(tour, state.updatedAt);
        if (nextEligibleAt && now < nextEligibleAt) {
          blockedTourIdSet.add(state.tourId);
        }
        continue;
      }
      if (tour.replayPolicy === TourReplayPolicy.NEVER) {
        blockedTourIdSet.add(state.tourId);
      }
    }

    return tours.filter((tour) => !blockedTourIdSet.has(tour.id));
  }

  async setTourUserState(
    tourId: string,
    organizationId: string,
    userId: string,
    status: TourUserStateStatus,
  ): Promise<TourUserState> {
    const tour = await this.findById(tourId, organizationId);

    let entity = await this.tourUserStateRepository.findOne({
      where: {
        tourId,
        organizationId,
        userId,
      },
    });

    if (!entity) {
      entity = this.tourUserStateRepository.create({
        tourId,
        organizationId,
        userId,
        status,
        resetVersion: tour.currentResetVersion || 0,
      });
    } else {
      entity.status = status;
      entity.resetVersion = tour.currentResetVersion || 0;
    }
    entity.expiresAt = null;
    entity.nextEligibleAt = this.computeNextEligibleAt(tour, new Date());

    return this.tourUserStateRepository.save(entity);
  }

  async resetTourAudienceState(tourId: string, organizationId: string): Promise<number> {
    const tour = await this.findById(tourId, organizationId);
    const impacted = await this.tourUserStateRepository.count({
      where: { tourId, organizationId },
    });
    tour.currentResetVersion = (tour.currentResetVersion || 0) + 1;
    await this.tourRepository.save(tour);
    return impacted;
  }

  async resetTourStateForUser(tourId: string, organizationId: string, userId: string): Promise<number> {
    await this.findById(tourId, organizationId);
    const result = await this.tourUserStateRepository.delete({
      tourId,
      organizationId,
      userId,
    });
    return result.affected || 0;
  }

  async resetTourStateForSegment(
    tourId: string,
    organizationId: string,
    dto: ResetTourSegmentDto,
  ): Promise<{ matchedUsers: number; clearedStates: number }> {
    await this.findById(tourId, organizationId);
    const userIds = await this.resolveSegmentUserIds(organizationId, dto);
    if (userIds.length === 0) {
      return { matchedUsers: 0, clearedStates: 0 };
    }
    const result = await this.tourUserStateRepository.delete({
      tourId,
      organizationId,
      userId: In(userIds),
    });
    return {
      matchedUsers: userIds.length,
      clearedStates: result.affected || 0,
    };
  }

  async runReplayEligibilityJob(organizationId?: string): Promise<{ updatedStates: number }> {
    const whereClause: any = {
      status: In([TourUserStateStatus.DISMISSED, TourUserStateStatus.COMPLETED]),
      nextEligibleAt: LessThanOrEqual(new Date()),
    };
    if (organizationId) {
      whereClause.organizationId = organizationId;
    }
    const candidates = await this.tourUserStateRepository.find({
      where: whereClause,
      relations: ['tour'],
    });
    let updatedStates = 0;
    for (const state of candidates) {
      if (!state.tour || state.tour.replayPolicy !== TourReplayPolicy.AFTER_PERIOD) {
        continue;
      }
      state.status = TourUserStateStatus.ELIGIBLE;
      await this.tourUserStateRepository.save(state);
      updatedStates += 1;
    }
    return { updatedStates };
  }

  private computeNextEligibleAt(tour: GuidedTour, baseDate: Date): Date | null {
    if (tour.replayPolicy !== TourReplayPolicy.AFTER_PERIOD || !tour.replayAfterDays || tour.replayAfterDays <= 0) {
      return null;
    }
    const next = new Date(baseDate);
    next.setDate(next.getDate() + tour.replayAfterDays);
    return next;
  }

  private async resolveSegmentUserIds(organizationId: string, dto: ResetTourSegmentDto): Promise<string[]> {
    if (dto.segment === TourResetSegment.ALL) {
      const users = await this.userRepository.find({
        where: { organizationId },
        select: ['id'],
      });
      return users.map((user) => user.id);
    }

    if (dto.segment === TourResetSegment.CUSTOM_USER_IDS) {
      const userIds = dto.userIds || [];
      if (userIds.length === 0) {
        return [];
      }
      const users = await this.userRepository.find({
        where: {
          organizationId,
          id: In(userIds),
        },
        select: ['id'],
      });
      return users.map((user) => user.id);
    }

    if (dto.segment === TourResetSegment.NEW_USERS) {
      const createdWithinDays = dto.createdWithinDays ?? 14;
      const since = new Date();
      since.setDate(since.getDate() - createdWithinDays);
      const users = await this.userRepository.find({
        where: {
          organizationId,
          createdAt: MoreThanOrEqual(since),
        },
        select: ['id'],
      });
      return users.map((user) => user.id);
    }

    if (dto.segment === TourResetSegment.INACTIVE_USERS) {
      const inactiveDays = dto.inactiveDays ?? 60;
      const before = new Date();
      before.setDate(before.getDate() - inactiveDays);
      const users = await this.userRepository.find({
        where: [
          {
            organizationId,
            lastLoginAt: IsNull(),
          },
          {
            organizationId,
            lastLoginAt: LessThanOrEqual(before),
          },
        ],
        select: ['id'],
      });
      return users.map((user) => user.id);
    }

    return [];
  }
}
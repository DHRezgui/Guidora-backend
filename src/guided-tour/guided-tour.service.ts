import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import * as path from 'path';
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
import { ContextualSemanticHintsRequestDto } from './dto/contextual-semantic-hints.dto';
import { TourSemanticPythonWorkerService } from './tour-semantic-python-worker.service';

export type ContextualSemanticRole =
  | 'entry'
  | 'navigation'
  | 'cta-primary'
  | 'form-field'
  | 'form-submit'
  | 'utility'
  | 'secondary'
  | 'result'
  | 'generic-click';

export interface ContextualSemanticHintResponse {
  roles: Array<{
    selector: string;
    role: ContextualSemanticRole;
    confidence: number;
    rationale?: string[];
  }>;
  preferredOrder?: string[];
  /**
   * Metadata advertising what powers the endpoint for THIS response.
   * The endpoint tries the sentence-transformers path first and falls
   * back to the deterministic rule-vote mirror on timeout / Python
   * error. The `kind` field reflects what actually ran.
   */
  implementation: {
    kind: 'rule-based-mirror' | 'sentence-transformers';
    note: string;
    phase: 'phase-1-local' | 'phase-2-embeddings';
    /** Sentence-transformers model id, when applicable. */
    model?: string;
    /** Why the rule fallback was used (only when kind == 'rule-based-mirror'). */
    fallbackReason?:
      | 'embeddings_disabled'
      | 'embeddings_timeout'
      | 'embeddings_error'
      | 'embeddings_worker_unavailable';
  };
}

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
  private readonly logger = new Logger(GuidedTourService.name);

  /**
   * Resolved once per process. Reads:
   * - SEMANTIC_TOUR_EMBEDDINGS_ENABLED ('true' to enable embeddings path)
   * - SEMANTIC_TOUR_EMBEDDINGS_TIMEOUT_MS (default 4000)
   * - PYTHON_EXECUTABLE (defaults to 'python3' on POSIX, 'python' on Windows)
   * - SEMANTIC_TOUR_WORKER_SCRIPT (defaults to ml/rag/tour_semantic_role_worker.py)
   */
  private readonly embeddingsEnabled = (process.env.SEMANTIC_TOUR_EMBEDDINGS_ENABLED ?? 'true').toLowerCase() === 'true';
  private readonly embeddingsTimeoutMs = Math.max(
    500,
    Number.parseInt(process.env.SEMANTIC_TOUR_EMBEDDINGS_TIMEOUT_MS ?? '8000', 10) || 8000,
  );

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
    private readonly tourSemanticWorker: TourSemanticPythonWorkerService,
  ) {}

  /**
   * Warm up the persistent Python worker (loads sentence-transformers once).
   * Called automatically on backend start unless SEMANTIC_TOUR_AUTO_WARMUP=false.
   */
  async warmupContextualSemanticEmbeddings(): Promise<{
    ready: boolean;
    warmed: boolean;
    embeddingsEnabled: boolean;
  }> {
    if (!this.embeddingsEnabled) {
      return { ready: false, warmed: false, embeddingsEnabled: false };
    }
    const warmed = await this.tourSemanticWorker.warmup();
    return {
      ready: warmed,
      warmed,
      embeddingsEnabled: true,
    };
  }

  /**
   * Read-only semantic inference endpoint backing the SDK hybrid layer.
   *
   * Phase 2 path: this method first tries to run the sentence-transformers
   * inference script (`ml/rag/tour_semantic_role_inference.py`). If the
   * Python process times out, errors, or is disabled by env, it falls
   * back deterministically to the rule-based mirror so the SDK always
   * receives a usable response within a bounded latency budget.
   *
   * The SDK fuses these hints with its local inference within bounded
   * deltas — failures or timeouts on the SDK side ALSO fall back to
   * local-only inference, so this endpoint is purely additive even when
   * both backend paths fail.
   */
  async inferContextualSemanticHints(
    dto: ContextualSemanticHintsRequestDto,
  ): Promise<ContextualSemanticHintResponse> {
    if (this.embeddingsEnabled) {
      const embedded = await this.runEmbeddingInference(dto);
      if (embedded.ok) {
        return embedded.response;
      }
      return this.runRuleBasedMirror(dto, embedded.reason);
    }

    return this.runRuleBasedMirror(dto, 'embeddings_disabled');
  }

  /**
   * Phase 2 — persistent Python worker (model loaded once per process).
   * On timeout / crash (after one restart) falls back with an explicit reason.
   */
  private async runEmbeddingInference(
    dto: ContextualSemanticHintsRequestDto,
  ): Promise<
    | { ok: true; response: ContextualSemanticHintResponse }
    | {
        ok: false;
        reason: 'embeddings_timeout' | 'embeddings_error' | 'embeddings_worker_unavailable';
      }
  > {
    const startedAt = Date.now();
    const payload = {
      candidates: dto.candidates,
      snapshot: dto.snapshot,
      hints: dto.hints,
      objectives: dto.objectives,
    };

    const workerResult = await this.tourSemanticWorker.infer(payload, this.embeddingsTimeoutMs);

    if (!workerResult.ok) {
      if (workerResult.reason === 'timeout') {
        this.logger.warn(
          `Semantic embedding inference timed out after ${this.embeddingsTimeoutMs}ms — falling back to rule mirror`,
        );
        return { ok: false, reason: 'embeddings_timeout' };
      }
      if (
        workerResult.reason === 'worker_unavailable' ||
        workerResult.reason === 'worker_crashed'
      ) {
        this.logger.warn(
          `Semantic embedding worker unavailable (${workerResult.reason}): ${workerResult.error ?? 'unknown'}`,
        );
        return { ok: false, reason: 'embeddings_worker_unavailable' };
      }
      this.logger.warn(
        `Semantic embedding inference failed (${workerResult.reason}): ${workerResult.error ?? 'unknown'}`,
      );
      return { ok: false, reason: 'embeddings_error' };
    }

    const parsed = workerResult.result;
    if (!parsed || parsed.success !== true || !Array.isArray(parsed.roles)) {
      this.logger.warn(
        `Semantic worker returned unsuccessful payload (error=${String(parsed?.error ?? 'unknown')})`,
      );
      return { ok: false, reason: 'embeddings_error' };
    }

    const roles = (parsed.roles as Array<{ selector?: unknown; role?: unknown; confidence?: unknown; rationale?: unknown }>)
      .map((row) => this.normaliseEmbeddingHint(row))
      .filter((row): row is { selector: string; role: ContextualSemanticRole; confidence: number; rationale?: string[] } => row !== null);

    const preferredOrder = Array.isArray(parsed.preferredOrder)
      ? (parsed.preferredOrder as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : undefined;

    const model =
      parsed.implementation &&
      typeof parsed.implementation === 'object' &&
      parsed.implementation !== null &&
      typeof (parsed.implementation as { model?: unknown }).model === 'string'
        ? ((parsed.implementation as { model: string }).model)
        : undefined;

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `Semantic inference (sentence-transformers, persistent worker) succeeded in ${elapsedMs}ms for ${roles.length} candidates`,
    );

    return {
      ok: true,
      response: {
        roles,
        preferredOrder,
        implementation: {
          kind: 'sentence-transformers',
          note:
            'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 embeddings + cosine similarity vs role prototypes (persistent worker). ' +
            'Confidence is margin-calibrated (top-1 minus top-2 similarity) so the SDK 0.55 guard stays meaningful.',
          phase: 'phase-2-embeddings',
          model,
        },
      },
    };
  }

  /**
   * Deterministic rule-vote classifier mirroring the SDK local engine.
   * Used as a backend fallback when the embedding path is disabled,
   * times out, or errors. Reported as `rule-based-mirror` so the lab UI
   * can show the user exactly what powered each response.
   */
  private runRuleBasedMirror(
    dto: ContextualSemanticHintsRequestDto,
    fallbackReason?:
      | 'embeddings_disabled'
      | 'embeddings_timeout'
      | 'embeddings_error'
      | 'embeddings_worker_unavailable',
  ): ContextualSemanticHintResponse {
    const utility = /réglages|settings|preferences|préférences|options|configuration|paramètres|parametres/i;
    const secondary = /guide|learn|découvrir|discover|aide|help|documentation|tutoriel|tutorial/i;
    const submit = /confirm|valid|submit|valider|soumettre|enregistrer|publier|sauvegarder|save|apply|appliquer/i;
    const ctaPrimary =
      /\b(cr[eé]er|create|d[eé]marrer|start|lancer|launch|ajouter|add|nouveau|nouvelle|new|get started|try|essayer|commencer|configurer|g[eé]n[eé]rer|generate|inviter|invite|importer|import|exporter|export|connecter|connect|relancer|recharger|actualiser|refresh|reload|retry|r[eé]essayer)\b/i;
    const result = /result|status|done|complete|success|résultat|terminé|fini/i;
    const entry = /bienvenue|welcome|aperçu|apercu|overview|introduction|commencez|prise en main/i;

    const hasForm = dto.snapshot.hasForm;
    const hasNav = dto.snapshot.hasNavigation;

    const roles = dto.candidates.map((candidate) => {
      const label = (candidate.label || '').toString();
      const tag = (candidate.tag || '').toLowerCase();
      const intent = (candidate.intent || '').toLowerCase();
      const zone = (candidate.zone || '').toLowerCase();
      const rationale: string[] = [];

      let role: ContextualSemanticRole = 'generic-click';
      let confidence = 0.3;

      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        role = 'form-field';
        confidence = 0.85;
        rationale.push(`form control <${tag}>`);
      } else if (tag === 'button' && submit.test(label)) {
        role = 'form-submit';
        confidence = 0.8;
        rationale.push(`button labeled like a submit ("${label}")`);
      } else if (tag === 'button' && ctaPrimary.test(label)) {
        role = 'cta-primary';
        confidence = 0.75;
        rationale.push(`primary CTA verb ("${label}")`);
      } else if (tag === 'a' && (zone === 'navigation' || zone === 'sidebar')) {
        role = 'navigation';
        confidence = 0.75;
        rationale.push('link inside navigation zone');
      } else if (utility.test(label)) {
        role = 'utility';
        confidence = 0.7;
        rationale.push(`utility vocabulary ("${label}")`);
      } else if (secondary.test(label) || intent === 'support-navigation') {
        role = 'secondary';
        confidence = 0.6;
        rationale.push(intent === 'support-navigation' ? 'intent=support-navigation' : `secondary vocabulary ("${label}")`);
      } else if (entry.test(label) || tag === 'h1' || tag === 'h2') {
        role = 'entry';
        confidence = 0.6;
        rationale.push(tag.startsWith('h') ? `heading <${tag}>` : `entry vocabulary ("${label}")`);
      } else if (result.test(label)) {
        role = 'result';
        confidence = 0.55;
        rationale.push(`result vocabulary ("${label}")`);
      } else if (submit.test(label)) {
        role = 'form-submit';
        confidence = 0.55;
        rationale.push(`submit vocabulary ("${label}")`);
      }

      if (hasForm && (role === 'form-field' || role === 'form-submit')) {
        confidence = Math.min(1, confidence + 0.05);
      }
      if (hasNav && role === 'navigation') {
        confidence = Math.min(1, confidence + 0.05);
      }

      return {
        selector: candidate.selector,
        role,
        confidence: Number(confidence.toFixed(3)),
        rationale,
      };
    });

    const order: ContextualSemanticRole[] = [
      'entry',
      'navigation',
      'cta-primary',
      'form-field',
      'form-submit',
      'utility',
      'secondary',
      'generic-click',
      'result',
    ];

    const preferredOrder = roles
      .slice()
      .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
      .map((role) => role.selector);

    return {
      roles,
      preferredOrder,
      implementation: {
        kind: 'rule-based-mirror',
        note: fallbackReason
          ? `Deterministic rule-vote classifier mirroring the SDK local engine (fallback: ${fallbackReason}).`
          : 'Deterministic rule-vote classifier mirroring the SDK local engine.',
        phase: 'phase-1-local',
        ...(fallbackReason ? { fallbackReason } : {}),
      },
    };
  }

  private normaliseEmbeddingHint(
    raw: { selector?: unknown; role?: unknown; confidence?: unknown; rationale?: unknown },
  ): { selector: string; role: ContextualSemanticRole; confidence: number; rationale?: string[] } | null {
    if (typeof raw.selector !== 'string' || raw.selector.length === 0) return null;
    if (typeof raw.role !== 'string') return null;
    const role = this.coerceRole(raw.role);
    if (!role) return null;
    const confidenceValue = typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence);
    const confidence = Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : 0;
    const rationale = Array.isArray(raw.rationale)
      ? (raw.rationale as unknown[]).filter((entry): entry is string => typeof entry === 'string').slice(0, 4)
      : undefined;
    return { selector: raw.selector, role, confidence, rationale };
  }

  private coerceRole(value: string): ContextualSemanticRole | null {
    const allowed: ContextualSemanticRole[] = [
      'entry',
      'navigation',
      'cta-primary',
      'form-field',
      'form-submit',
      'utility',
      'secondary',
      'result',
      'generic-click',
    ];
    return (allowed as string[]).includes(value) ? (value as ContextualSemanticRole) : null;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

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
      if (quality.semanticCompensationReasons.length > 0) {
        outcomeReasons.push(...quality.semanticCompensationReasons);
      }

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

  /**
   * Single-step (or short) primary-action tours only need one stable anchor — typically the CTA.
   * Multi-step discovery / form sequences keep the scenario threshold (e.g. 2 on MEDIUM).
   */
  private resolveRequiredStableSteps(
    draft: ContextualSuggestedDraftDto,
    threshold: ScenarioThreshold,
  ): number {
    const steps = draft.steps ?? [];
    const intent = (draft.intent ?? '').toLowerCase();

    if (intent === 'primary-action' && steps.length <= 2) {
      return 1;
    }

    return threshold.minStableSteps;
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
    semanticCompensationReasons: string[];
  } {
    const reasons: string[] = [];
    const semanticCompensationReasons: string[] = [];
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

    const normalizedIntent = (draft.intent ?? '').toLowerCase();
    const isPrimaryIntent = normalizedIntent === 'primary-action';
    const isSupportIntent = normalizedIntent === 'support-navigation';
    const allowSemanticCompensation = scenario !== ContextualScenario.STRESS;
    const primaryStep = this.pickPrimaryStep(steps);
    const allowFingerprintBridge = scenario === ContextualScenario.SIMPLE && steps.length <= 3;
    const qualityAnchorStep =
      primaryStep && !this.isStepStable(primaryStep, allowFingerprintBridge)
        ? steps.find(
            (step) =>
              this.isStepStable(step, allowFingerprintBridge) ||
              this.hasStableAlternativeSelector(step) ||
              (allowFingerprintBridge && this.hasStrongFingerprint(step)),
          ) ?? primaryStep
        : primaryStep;
    const primarySelector = qualityAnchorStep?.targetSelector;
    const primarySemanticCompensated =
      allowSemanticCompensation && this.isSemanticCompensationEligible(qualityAnchorStep, scenario);
    const primaryStable = this.isStepStable(qualityAnchorStep, allowFingerprintBridge) || primarySemanticCompensated;
    const primaryFragile = this.isFragileSelector(primarySelector);
    const primaryHasStableAlternative = this.hasStableAlternativeSelector(qualityAnchorStep);
    const supportHasStableAnchor = steps.some(
      (step) =>
        this.isStepStable(step, allowFingerprintBridge) ||
        this.hasStableAlternativeSelector(step) ||
        (allowFingerprintBridge && this.hasStrongFingerprint(step)),
    );
    const supportHasSemanticCompensatedAnchor =
      allowSemanticCompensation &&
      steps.some((step) => this.isSemanticCompensationEligible(step, scenario));

    if (
      primaryFragile &&
      !primaryStable &&
      !primaryHasStableAlternative &&
      !(allowFingerprintBridge && this.hasStrongFingerprint(qualityAnchorStep)) &&
      !(isSupportIntent && (supportHasStableAnchor || supportHasSemanticCompensatedAnchor))
    ) {
      reasons.push('primary_selector_fragile_only');
    }

    // An `action: 'NEXT'` step is informational by definition — the user just
    // reads the tooltip and clicks "Suivant", they do NOT interact with the
    // anchored element. Demanding an actionable selector on such steps would
    // wrongly reject discovery-oriented primary intents (e.g. fintech
    // `banking-dashboard`: the first step points at the KPI region for the
    // user to read, before later steps walk through the actual CTAs).
    const primaryActionRequired =
      primaryStep?.action !== undefined && primaryStep.action !== ActionType.NEXT;
    const intentTargetCoherent =
      !isPrimaryIntent || !primaryActionRequired || this.isStepActionable(primaryStep);
    if (!intentTargetCoherent) {
      reasons.push('primary_intent_not_actionable');
    }

    const stableSteps = steps.filter(
      (step) =>
        this.isStepStable(step, allowFingerprintBridge) ||
        (allowSemanticCompensation && this.isSemanticCompensationEligible(step, scenario)),
    ).length;
    if (allowSemanticCompensation) {
      for (const step of steps) {
        const compensation = this.getSemanticCompensationReason(step, scenario);
        if (!compensation) continue;
        semanticCompensationReasons.push(compensation);
      }
    }
    const requiredStableSteps = this.resolveRequiredStableSteps(draft, threshold);
    if (stableSteps < requiredStableSteps) {
      reasons.push('stable_selector_coverage_too_low');
    }

    // [TEMP DEBUG] Log selectors when quality rejection happens so we can
    // tune isActionableSelector / isStableSelector against real-world output
    // from the SDK selector builder.
    if (reasons.length > 0) {
      const dbg = {
        draftId: (draft as { id?: string }).id ?? '(no-id)',
        intent: draft.intent,
        primarySelector,
        primaryStable,
        primaryFragile,
        allowFingerprintBridge,
        stableSteps,
        minStableSteps: threshold.minStableSteps,
        requiredStableSteps,
        reasons,
        allSelectors: steps.map((s) => s.targetSelector),
      };
      // eslint-disable-next-line no-console
      console.log('[QUALITY-REJECT]', JSON.stringify(dbg));
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
      semanticCompensationReasons,
    };
  }

  private pickPrimaryStep(steps: ContextualDraftStepDto[]): ContextualDraftStepDto | undefined {
    return (
      steps.find((step) => step.isPrimary) ??
      steps.find((step) => (step.intent ?? '').toLowerCase() === 'primary-action') ??
      steps[0]
    );
  }

  private hasStableAlternativeSelector(step?: ContextualDraftStepDto): boolean {
    if (!step?.selectorAlternatives || step.selectorAlternatives.length === 0) {
      return false;
    }
    return step.selectorAlternatives.some((selector) => this.isStableSelector(selector));
  }

  private hasStrongFingerprint(step?: ContextualDraftStepDto): boolean {
    const fp = step?.targetFingerprint;
    if (!fp || typeof fp !== 'object') return false;
    const tagName = typeof fp.tagName === 'string' ? fp.tagName.trim() : '';
    const role = typeof fp.role === 'string' ? fp.role.trim() : '';
    const ariaLabel = typeof fp.ariaLabel === 'string' ? fp.ariaLabel.trim() : '';
    const textSample = typeof fp.textSample === 'string' ? fp.textSample.trim() : '';
    if (!tagName) return false;
    return Boolean(role || ariaLabel || textSample.length >= 6);
  }

  private hasCompleteFingerprint(step?: ContextualDraftStepDto): boolean {
    const fp = step?.targetFingerprint;
    if (!fp || typeof fp !== 'object') return false;
    const tagName = typeof fp.tagName === 'string' ? fp.tagName.trim() : '';
    const role = typeof fp.role === 'string' ? fp.role.trim() : '';
    const textSample = typeof fp.textSample === 'string' ? fp.textSample.trim() : '';
    return Boolean(tagName && role && textSample.length >= 3);
  }

  private isSemanticCompensationEligible(
    step: ContextualDraftStepDto | undefined,
    scenario: ContextualScenario,
  ): boolean {
    if (!step || scenario === ContextualScenario.STRESS) return false;
    const confidence =
      typeof step.semanticRoleConfidence === 'number' && Number.isFinite(step.semanticRoleConfidence)
        ? step.semanticRoleConfidence
        : 0;
    const stabilityScore =
      typeof step.stabilityScore === 'number' && Number.isFinite(step.stabilityScore)
        ? step.stabilityScore
        : 0;
    return confidence >= 0.75 && stabilityScore >= 40 && this.hasCompleteFingerprint(step);
  }

  private getSemanticCompensationReason(
    step: ContextualDraftStepDto | undefined,
    scenario: ContextualScenario,
  ): string | null {
    if (!this.isSemanticCompensationEligible(step, scenario)) return null;
    const confidence = (step?.semanticRoleConfidence ?? 0).toFixed(2);
    return `published via semantic compensation (confidence: ${confidence})`;
  }

  private isStepStable(step?: ContextualDraftStepDto, allowFingerprintBridge = false): boolean {
    if (!step) return false;
    if (this.isStableSelector(step.targetSelector)) return true;
    if (this.hasStableAlternativeSelector(step)) return true;
    if (typeof step.stabilityScore === 'number' && Number.isFinite(step.stabilityScore) && step.stabilityScore >= 70) {
      return true;
    }
    if (this.hasStrongFingerprint(step) && typeof step.stabilityScore === 'number' && step.stabilityScore >= 58) {
      return true;
    }
    // "Unknown domain" bridge: in SIMPLE scenario with short drafts, accept
    // low-selector-stability steps when a strong fingerprint exists.
    if (
      allowFingerprintBridge &&
      this.hasStrongFingerprint(step) &&
      typeof step.stabilityScore === 'number' &&
      step.stabilityScore >= 20
    ) {
      return true;
    }
    return false;
  }

  private isStableSelector(selector?: string): boolean {
    if (!selector) {
      return false;
    }
    // Canonical stable hooks: test IDs explicitly placed by developers for
    // automation / onboarding. Highest stability tier.
    if (/data-tour-id|data-testid|data-cy|data-qa/i.test(selector)) {
      return true;
    }
    // ARIA contract attributes: `role`, `aria-label`, `aria-labelledby`.
    // These belong to the accessibility contract of the host app and are
    // therefore stable across CSS / framework refactors — unlike Tailwind /
    // BEM class names, an `aria-label="Recent Transactions"` is not going
    // to be renamed on a whim because a11y testing would immediately catch
    // the regression. We treat them as a stable anchor on par with test IDs.
    if (/\[role=["']/i.test(selector)) {
      return true;
    }
    if (/\[aria-label(?:ledby)?[\^*~|]?=/i.test(selector)) {
      return true;
    }
    // Stable HTML structural attributes that encode business identity, not
    // presentation: `id`, `name`, `for`.
    if (/#[A-Za-z][\w-]*\b/.test(selector)) {
      return true;
    }
    if (/\[(?:name|for)=["']/i.test(selector)) {
      return true;
    }
    // Route anchors are stable in SPA/Next.js apps: `/budget`, `/activity`,
    // `/settings`, etc. belong to the product's information architecture and
    // are far less volatile than CSS classes or DOM positions. Blueprint
    // cross-page steps often resolve to sidebar/nav links (`a[href="/..."]`);
    // rejecting those forced otherwise valid contextual drafts to fail with
    // `stable_selector_coverage_too_low` on real finance dashboards.
    if (/a\[href[\^*$|~]?=["']\/[^"']+["']\]/i.test(selector)) {
      return true;
    }
    return false;
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
    // Explicit tag-based actionable patterns: <button>, <a>, role="button",
    // <input type="submit"|"button">.
    if (
      /(button|\[role=["']button["']\]|a\[|input\[type=["']submit["']\]|input\[type=["']button["']\])/i.test(
        selector,
      )
    ) {
      return true;
    }
    // ARIA interactive roles other than `button` that the WAI-ARIA spec
    // marks as user-actuatable. Modern UI kits (Radix, Headless UI, shadcn,
    // Reach UI, Material UI) systematically tag their tabs, links, menu
    // items, options, switches, etc. with these roles. Treating them as
    // actionable allows the resolver to anchor `CLICK` steps on a
    // shadcn `TabsTrigger` rendered as `<button role="tab">` without
    // requiring the host app to add `data-tour-id` on every tab.
    if (
      /\[role=["'](link|tab|menuitem|menuitemcheckbox|menuitemradio|option|checkbox|radio|switch|combobox|treeitem)["']\]/i.test(
        selector,
      )
    ) {
      return true;
    }
    // ARIA landmark / region roles. A11y-conformant apps expose informational
    // surfaces (dashboards, lists, panels) via these roles. They are valid
    // anchors for `NEXT`-style discovery steps where the tour merely points
    // at a region for the user to read — not to click. Without this branch
    // every informational blueprint step anchored on a shadcn `Card` would
    // be rejected with `primary_intent_not_actionable`.
    if (
      /\[role=["'](region|tabpanel|article|main|navigation|complementary|contentinfo|banner|form|search|dialog|alertdialog)["']\]/i.test(
        selector,
      )
    ) {
      return true;
    }
    // Strong a11y signal: any element carrying an `aria-label` is an
    // explicitly named target — almost always interactive or designed to
    // receive focus (icon-only buttons, search inputs, navigation menus).
    if (/\[aria-label(?:ledby)?[\^*~|]?=/i.test(selector)) {
      return true;
    }
    // Convention-based fallback: by the TrustDev SDK contract, `data-tour-id`
    // (and the widely-used `data-testid` / `data-cy` / `data-qa`) are only ever
    // posed on elements meant to be interacted with by a tour. A selector
    // anchored on one of these stable attributes is therefore considered
    // actionable even when the tag part was omitted (e.g. `[data-tour-id="x"]`,
    // which `document.querySelector` will still resolve to the actual button
    // or anchor at runtime).
    if (/\[data-(tour-id|testid|cy|qa)/i.test(selector)) {
      return true;
    }
    // ID-based selectors (`#some-id`). An `id` is a unique handle to one
    // specific element — developers do not give random ids to non-interactive
    // decoration. In practice, on shadcn/Radix/Headless UI apps the
    // auto-generated id pattern (e.g. `#radix-_r_0_-trigger-dashboard`) is
    // ALWAYS posed on the actual focusable trigger (button, link, input,
    // tab). For test pages with hand-written ids (`#submit-btn`, `#search`),
    // the convention is the same. Treat any id-anchored selector as a
    // legitimate actionable target.
    if (/#[A-Za-z][\w-]*\b/.test(selector)) {
      return true;
    }
    return false;
  }

  private isStepActionable(step?: ContextualDraftStepDto): boolean {
    if (!step) return false;
    if (this.isActionableSelector(step.targetSelector)) return true;
    if (step.selectorAlternatives?.some((selector) => this.isActionableSelector(selector))) return true;
    const fp = step.targetFingerprint;
    if (fp && typeof fp === 'object') {
      const tagName = typeof fp.tagName === 'string' ? fp.tagName.toLowerCase() : '';
      const role = typeof fp.role === 'string' ? fp.role.toLowerCase() : '';
      if (tagName === 'button' || tagName === 'a' || tagName === 'input') return true;
      if (['button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'radio', 'switch'].includes(role)) {
        return true;
      }
    }
    return false;
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
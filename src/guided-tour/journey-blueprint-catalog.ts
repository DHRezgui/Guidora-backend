/**
 * Catalog aligned with `@trustdev/onboarding-sdk-react` JourneyBlueprint types.
 * Dashboard pickers and API validation use these lists (closed union for semanticRole).
 */

export const JOURNEY_VERTICALS = [
  'ecommerce',
  'saas',
  'marketing',
  'dashboard',
  'support',
  'tech',
  'hr',
  'social',
  'elearning',
  'realestate',
  'fintech',
  'healthtech',
  'productivity',
] as const;

export type JourneyVerticalCatalog = (typeof JOURNEY_VERTICALS)[number];

export const TOUR_DRAFT_INTENTS = [
  'discovery',
  'primary-action',
  'support-navigation',
  'form-flow',
] as const;

export const JOURNEY_STEP_SEMANTIC_ROLES = [
  'ecommerce.browse-catalog',
  'ecommerce.view-product',
  'ecommerce.add-to-cart',
  'ecommerce.view-cart',
  'ecommerce.checkout',
  'ecommerce.confirm-order',
  'saas.dashboard-overview',
  'saas.create-resource',
  'saas.invite-teammate',
  'saas.open-settings',
  'saas.first-login',
  'saas.setup-wizard',
  'saas.profile-completion',
  'saas.welcome-checklist',
  'saas.feature-announcement',
  'saas.feature-tooltip',
  'saas.changelog',
  'account.billing',
  'account.notifications',
  'account.security',
  'account.plan-upgrade',
  'dashboard.kpi-overview',
  'dashboard.filter-panel',
  'dashboard.date-picker',
  'dashboard.chart-explore',
  'dashboard.export-data',
  'support.faq-navigation',
  'support.ticket-create',
  'support.docs-guided',
  'support.contact-help',
  'marketing.cta-hero',
  'marketing.contact-form',
  'marketing.newsletter-signup',
  'marketing.demo-request',
  'auth.register',
  'auth.login',
  'auth.view-profile',
  'tech.api-explorer',
  'tech.code-playground',
  'tech.interactive-docs',
  'tech.auth-token',
  'hr.employee-onboarding',
  'hr.leave-request',
  'hr.org-chart',
  'hr.performance-review',
  'social.user-profile',
  'social.feed-scroll',
  'social.notifications',
  'social.create-post',
  'elearning.course-catalog',
  'elearning.start-course',
  'elearning.quiz-attempt',
  'elearning.progress-tracking',
  'realestate.property-search',
  'realestate.property-detail',
  'realestate.mortgage-simulator',
  'realestate.virtual-tour',
  'realestate.contact-agent',
  'fintech.banking-dashboard',
  'fintech.transactions-list',
  'fintech.transfer-money',
  'fintech.investment-portfolio',
  'fintech.expense-dashboard',
  'fintech.category-breakdown',
  'fintech.expense-list',
  'fintech.expense-filter',
  'fintech.add-expense',
  'healthtech.patient-record',
  'healthtech.book-appointment',
  'healthtech.medical-history',
  'healthtech.prescription-renewal',
  'healthtech.management-dashboard',
  'healthtech.facility-management',
  'healthtech.pharmacy-inventory',
  'healthtech.patient-analytics',
  'healthtech.healthcare-reports',
  'productivity.dashboard-overview',
  'productivity.search-workspace',
  'productivity.create-project',
  'productivity.import-data',
  'productivity.open-tasks',
  'productivity.create-task',
  'productivity.task-list',
  'productivity.open-team',
  'productivity.invite-member',
  'productivity.open-analytics',
  'productivity.kpi-overview',
  'productivity.export-report',
  'productivity.open-calendar',
  'productivity.calendar-view',
] as const;

export type JourneyStepSemanticRoleCatalog = (typeof JOURNEY_STEP_SEMANTIC_ROLES)[number];

const SEMANTIC_ROLE_SET = new Set<string>(JOURNEY_STEP_SEMANTIC_ROLES);
const VERTICAL_SET = new Set<string>(JOURNEY_VERTICALS);
const INTENT_SET = new Set<string>(TOUR_DRAFT_INTENTS);

const POSITION_TYPES = new Set([
  'TOP',
  'BOTTOM',
  'LEFT',
  'RIGHT',
  'CENTER',
  'TOP_LEFT',
  'TOP_RIGHT',
  'BOTTOM_LEFT',
  'BOTTOM_RIGHT',
]);

const ACTION_TYPES = new Set(['CLICK', 'HOVER', 'SCROLL', 'NEXT', 'SKIP', 'COMPLETE']);

const ELEMENT_TAGS = new Set([
  'a',
  'button',
  'input',
  'form',
  'select',
  'textarea',
  'div',
  'section',
  'article',
  'ul',
  'table',
]);

export interface JourneyBlueprintValidationResult {
  valid: boolean;
  errors: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runtime validation that a stored payload matches the SDK `JourneyBlueprint` shape.
 */
export function validateJourneyBlueprintPayload(payload: unknown): JourneyBlueprintValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(payload)) {
    return { valid: false, errors: ['payload must be a JSON object'] };
  }

  const id = payload.id;
  if (typeof id !== 'string' || !/^[a-z][a-z0-9.-]{2,127}$/.test(id)) {
    errors.push('id must be a lowercase slug (e.g. custom.crm.pipeline)');
  }

  if (typeof payload.name !== 'string' || payload.name.trim().length < 2) {
    errors.push('name is required (min 2 chars)');
  }

  if (typeof payload.description !== 'string' || payload.description.trim().length < 4) {
    errors.push('description is required (min 4 chars)');
  }

  const vertical = payload.vertical;
  if (typeof vertical !== 'string' || !VERTICAL_SET.has(vertical)) {
    errors.push(`vertical must be one of: ${JOURNEY_VERTICALS.join(', ')}`);
  }

  const intent = payload.intent;
  if (typeof intent !== 'string' || !INTENT_SET.has(intent)) {
    errors.push(`intent must be one of: ${TOUR_DRAFT_INTENTS.join(', ')}`);
  }

  if (!Array.isArray(payload.steps) || payload.steps.length === 0) {
    errors.push('steps must be a non-empty array');
  } else {
    payload.steps.forEach((step, index) => {
      if (!isPlainObject(step)) {
        errors.push(`steps[${index}] must be an object`);
        return;
      }
      const role = step.semanticRole;
      if (typeof role !== 'string' || !SEMANTIC_ROLE_SET.has(role)) {
        errors.push(
          `steps[${index}].semanticRole must be a known SDK role (see journey-blueprint-catalog)`,
        );
      }
      if (typeof step.title !== 'string' || step.title.trim().length < 1) {
        errors.push(`steps[${index}].title is required`);
      }
      if (typeof step.description !== 'string' || step.description.trim().length < 1) {
        errors.push(`steps[${index}].description is required`);
      }
      if (step.position !== undefined && !POSITION_TYPES.has(String(step.position))) {
        errors.push(`steps[${index}].position is invalid`);
      }
      if (step.action !== undefined && !ACTION_TYPES.has(String(step.action))) {
        errors.push(`steps[${index}].action is invalid`);
      }
      if (step.required !== undefined && typeof step.required !== 'boolean') {
        errors.push(`steps[${index}].required must be boolean`);
      }
      if (step.inferAfter !== undefined) {
        if (!Array.isArray(step.inferAfter)) {
          errors.push(`steps[${index}].inferAfter must be an array`);
        } else {
          step.inferAfter.forEach((r, j) => {
            if (typeof r !== 'string' || !SEMANTIC_ROLE_SET.has(r)) {
              errors.push(`steps[${index}].inferAfter[${j}] is not a known semantic role`);
            }
          });
        }
      }
      const hints = step.targetHints;
      if (!isPlainObject(hints)) {
        errors.push(`steps[${index}].targetHints is required`);
      } else {
        if (hints.routePatterns !== undefined) {
          if (
            !Array.isArray(hints.routePatterns) ||
            !hints.routePatterns.every((p) => typeof p === 'string')
          ) {
            errors.push(`steps[${index}].targetHints.routePatterns must be string[]`);
          }
        }
        if (hints.selectorHints !== undefined) {
          if (
            !Array.isArray(hints.selectorHints) ||
            !hints.selectorHints.every((p) => typeof p === 'string')
          ) {
            errors.push(`steps[${index}].targetHints.selectorHints must be string[]`);
          }
        }
        if (hints.semanticTokens !== undefined) {
          if (
            !Array.isArray(hints.semanticTokens) ||
            !hints.semanticTokens.every((p) => typeof p === 'string')
          ) {
            errors.push(`steps[${index}].targetHints.semanticTokens must be string[]`);
          }
        }
        if (hints.actionVerbs !== undefined) {
          if (
            !Array.isArray(hints.actionVerbs) ||
            !hints.actionVerbs.every((p) => typeof p === 'string')
          ) {
            errors.push(`steps[${index}].targetHints.actionVerbs must be string[]`);
          }
        }
        if (hints.elementTags !== undefined) {
          if (
            !Array.isArray(hints.elementTags) ||
            !hints.elementTags.every((t) => ELEMENT_TAGS.has(String(t)))
          ) {
            errors.push(`steps[${index}].targetHints.elementTags contains invalid tag`);
          }
        }
        const hasHint =
          (Array.isArray(hints.semanticTokens) && hints.semanticTokens.length > 0) ||
          (Array.isArray(hints.selectorHints) && hints.selectorHints.length > 0) ||
          (Array.isArray(hints.routePatterns) && hints.routePatterns.length > 0) ||
          (Array.isArray(hints.actionVerbs) && hints.actionVerbs.length > 0);
        if (!hasHint) {
          errors.push(
            `steps[${index}].targetHints needs at least one of semanticTokens, selectorHints, routePatterns, actionVerbs`,
          );
        }
      }
    });
  }

  if (payload.minResolvedSteps !== undefined) {
    const n = payload.minResolvedSteps;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      errors.push('minResolvedSteps must be a positive integer');
    }
  }

  if (payload.priority !== undefined) {
    const p = payload.priority;
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      errors.push('priority must be a number');
    }
  }

  if (typeof id === 'string' && vertical === id.split('.')[0] && vertical !== payload.vertical) {
    // no-op: optional consistency check skipped
  }

  if (typeof id === 'string' && typeof vertical === 'string' && !id.startsWith(`${vertical}.`) && !id.startsWith('custom.')) {
    errors.push(
      `id should start with vertical prefix ("${vertical}.") or "custom." for org-specific blueprints`,
    );
  }

  return { valid: errors.length === 0, errors };
}

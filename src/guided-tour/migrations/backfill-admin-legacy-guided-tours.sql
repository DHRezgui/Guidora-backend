-- Idempotent backfill: align legacy admin production tours with current runtime rules.
-- - contextual-engine tours without publishedByRole were treated as developer-only autogen
-- - admin-validated production tours get sandbox_status = approved when still null
-- Safe to re-run; never deletes tours or steps.

-- 1) Mark contextual drafts published by an admin (visible to all users in production when active).
UPDATE guided_tours gt
SET
  trigger_conditions = jsonb_set(
    COALESCE(gt.trigger_conditions, '{}'::jsonb),
    '{contextualEngine,publishedByRole}',
    '"ADMIN"'::jsonb,
    true
  ),
  updated_at = NOW()
FROM users u
WHERE gt.created_by = u.id
  AND u.role = 'ADMIN'
  AND gt.environment = 'production'
  AND gt.trigger_conditions->>'source' = 'contextual-engine'
  AND COALESCE(gt.trigger_conditions->'contextualEngine'->>'publishedByRole', '') = '';

-- 2) Legacy admin contextual tours promoted before sandbox_status existed.
UPDATE guided_tours gt
SET
  sandbox_status = 'approved',
  sandbox_rejection_reason = NULL,
  sandbox_rejected_at = NULL,
  sandbox_rejected_by = NULL,
  updated_at = NOW()
FROM users u
WHERE gt.created_by = u.id
  AND u.role = 'ADMIN'
  AND gt.environment = 'production'
  AND gt.sandbox_status IS NULL
  AND gt.trigger_conditions->>'source' = 'contextual-engine';

-- 3) Optional: dhia.rezgui@ensi-uma.tn account — ensure manual production tours are not stuck in sandbox QA metadata.
UPDATE guided_tours gt
SET
  environment = 'production',
  updated_at = NOW()
FROM users u
WHERE gt.created_by = u.id
  AND u.email = 'dhia.rezgui@ensi-uma.tn'
  AND gt.environment = 'sandbox'
  AND gt.sandbox_status = 'approved';

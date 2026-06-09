-- Aligne les autogen sandbox legacy sans publishedByRole sur les règles runtime actuelles.
-- Idempotent : ne modifie que les lignes sans publishedByRole.

UPDATE guided_tours gt
SET
  trigger_conditions = jsonb_set(
    COALESCE(gt.trigger_conditions, '{}'::jsonb),
    '{contextualEngine,publishedByRole}',
    '"DEVELOPER"'::jsonb,
    true
  ),
  updated_at = NOW()
FROM users u
WHERE gt.created_by = u.id
  AND u.role = 'DEVELOPER'
  AND gt.environment = 'sandbox'
  AND gt.trigger_conditions->>'source' = 'contextual-engine'
  AND COALESCE(gt.trigger_conditions->'contextualEngine'->>'publishedByRole', '') = '';

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
  AND gt.environment = 'sandbox'
  AND gt.trigger_conditions->>'source' = 'contextual-engine'
  AND COALESCE(gt.trigger_conditions->'contextualEngine'->>'publishedByRole', '') = '';

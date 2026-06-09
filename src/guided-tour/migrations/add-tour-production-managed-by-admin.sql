-- Gestionnaire prod unique pour parcours admin (lecture seule pour les autres admins).
ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS production_managed_by_admin_id UUID NULL
    REFERENCES users(id) ON DELETE SET NULL;

-- Parcours admin déjà en production : le créateur reste gestionnaire par défaut.
UPDATE guided_tours gt
SET production_managed_by_admin_id = gt.created_by,
    updated_at = NOW()
FROM users u
WHERE gt.created_by = u.id
  AND u.role = 'ADMIN'
  AND gt.environment = 'production'
  AND gt.developer_private = false
  AND gt.production_managed_by_admin_id IS NULL
  AND NOT (
    gt.developer_private = true
    OR COALESCE(gt.trigger_conditions->'contextualEngine'->>'publishedByRole', '') = 'DEVELOPER'
  );

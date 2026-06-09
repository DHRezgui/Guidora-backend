-- Verrou d'édition exclusif pour blueprints (flux admin-admin).
ALTER TABLE organization_journey_blueprints
  ADD COLUMN IF NOT EXISTS edit_locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edit_locked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS edit_lock_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_org_journey_blueprints_edit_lock_expires
  ON organization_journey_blueprints(edit_lock_expires_at)
  WHERE edit_locked_by IS NOT NULL;

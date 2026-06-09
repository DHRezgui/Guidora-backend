-- Verrou d'édition exclusif pour gestion admin des organisations.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS edit_locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edit_locked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS edit_lock_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_edit_lock_expires
  ON organizations(edit_lock_expires_at)
  WHERE edit_locked_by IS NOT NULL;

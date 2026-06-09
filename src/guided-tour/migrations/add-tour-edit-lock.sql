-- Verrou d'édition exclusif pour parcours en collaboration multi-utilisateurs.
ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS edit_locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edit_locked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS edit_lock_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_guided_tours_edit_lock_expires
  ON guided_tours(edit_lock_expires_at)
  WHERE edit_locked_by IS NOT NULL;

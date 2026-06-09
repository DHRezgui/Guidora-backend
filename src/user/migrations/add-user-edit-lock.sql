-- Verrou d'édition exclusif pour gestion admin des utilisateurs.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS edit_locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edit_locked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS edit_lock_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_edit_lock_expires
  ON users(edit_lock_expires_at)
  WHERE edit_locked_by IS NOT NULL;

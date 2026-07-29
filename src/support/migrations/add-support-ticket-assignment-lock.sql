-- Support ticket assignment / collaboration / concurrency lock
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'collaborators'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN collaborators JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'edit_locked_by'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN edit_locked_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'edit_locked_at'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN edit_locked_at TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'edit_lock_expires_at'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN edit_lock_expires_at TIMESTAMPTZ NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'support_tickets' AND indexname = 'idx_tickets_edit_lock_expires'
  ) THEN
    CREATE INDEX idx_tickets_edit_lock_expires ON support_tickets(edit_lock_expires_at)
      WHERE edit_locked_by IS NOT NULL;
  END IF;
END $$;

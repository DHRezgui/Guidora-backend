-- Soft delete for support tickets (dashboard, org ADMIN)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN deleted_at TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN deleted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

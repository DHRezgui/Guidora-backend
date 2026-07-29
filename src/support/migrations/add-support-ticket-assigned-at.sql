-- Track last assignment change for take-over cooldown / concurrency UX
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'assigned_at'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN assigned_at TIMESTAMPTZ NULL;
  END IF;
END $$;

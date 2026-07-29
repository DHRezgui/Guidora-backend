-- Append-only lifecycle / ownership history for support tickets
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'lifecycle_history'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN lifecycle_history JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Support tickets: admin email replies history
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'admin_replies'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN admin_replies JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

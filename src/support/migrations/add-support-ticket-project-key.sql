-- Support tickets V2: project scoping (aligns with FAQ project_key / SDK flowVersion)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'project_key'
  ) THEN
    ALTER TABLE support_tickets ADD COLUMN project_key VARCHAR(120) NOT NULL DEFAULT 'default';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'support_tickets' AND indexname = 'idx_tickets_org_project'
  ) THEN
    CREATE INDEX idx_tickets_org_project ON support_tickets(organization_id, project_key);
  END IF;
END $$;

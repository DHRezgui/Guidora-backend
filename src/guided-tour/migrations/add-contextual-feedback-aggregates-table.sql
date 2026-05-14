-- Idempotent migration: only adds the new table + index.
-- Safe to run on existing DB; never drops or alters existing data.

CREATE TABLE IF NOT EXISTS contextual_feedback_aggregates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    target_url VARCHAR(500) NOT NULL,
    selector VARCHAR(1024) NOT NULL,
    intent VARCHAR(64) NOT NULL,
    shown_count INTEGER NOT NULL DEFAULT 0,
    clicked_count INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contextual_feedback_key UNIQUE (organization_id, target_url, selector, intent)
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'contextual_feedback_aggregates'
      AND indexname = 'idx_contextual_feedback_org_url'
  ) THEN
    CREATE INDEX idx_contextual_feedback_org_url
      ON contextual_feedback_aggregates(organization_id, target_url);
  END IF;
END $$;

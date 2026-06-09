-- Idempotent migration: adds sandbox environment columns to guided_tours.
-- Safe to run on existing DB; never drops or alters existing data.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_environment') THEN
    CREATE TYPE tour_environment AS ENUM ('sandbox', 'production');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_sandbox_status') THEN
    CREATE TYPE tour_sandbox_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS environment tour_environment NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS sandbox_status tour_sandbox_status NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'guided_tours'
      AND indexname = 'idx_guided_tours_org_environment'
  ) THEN
    CREATE INDEX idx_guided_tours_org_environment
      ON guided_tours(organization_id, environment);
  END IF;
END $$;

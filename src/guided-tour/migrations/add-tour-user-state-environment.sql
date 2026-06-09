-- Idempotent migration: scopes tour_user_states by audience environment (sandbox vs production).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_environment') THEN
    CREATE TYPE tour_environment AS ENUM ('sandbox', 'production');
  END IF;
END $$;

ALTER TABLE tour_user_states
  ADD COLUMN IF NOT EXISTS environment tour_environment NOT NULL DEFAULT 'production';

-- Existing rows on sandbox tours were recorded during sandbox QA.
UPDATE tour_user_states tus
SET environment = 'sandbox'
FROM guided_tours gt
WHERE tus.tour_id = gt.id
  AND gt.environment = 'sandbox'
  AND tus.environment = 'production';

ALTER TABLE tour_user_states
  DROP CONSTRAINT IF EXISTS uq_tour_user_states_tour_user;

DROP INDEX IF EXISTS idx_tour_user_states_tour_user_unique;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_tour_user_states_tour_user_env'
  ) THEN
    ALTER TABLE tour_user_states
      ADD CONSTRAINT uq_tour_user_states_tour_user_env UNIQUE (tour_id, user_id, environment);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'tour_user_states'
      AND indexname = 'idx_tour_user_states_tour_user_env'
  ) THEN
    CREATE INDEX idx_tour_user_states_tour_user_env
      ON tour_user_states (tour_id, user_id, environment);
  END IF;
END $$;

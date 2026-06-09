-- Test sandbox des parcours déjà promus en production (admin).
ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS is_sandbox_test_active BOOLEAN NOT NULL DEFAULT false;

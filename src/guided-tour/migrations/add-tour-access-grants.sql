-- Tour sharing: view-only and sandbox collaboration within organization.
DO $$ BEGIN
  CREATE TYPE tour_access_mode AS ENUM ('view', 'collaborate');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS in_collaboration BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS guided_tour_access_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tour_id UUID NOT NULL REFERENCES guided_tours(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_mode tour_access_mode NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tour_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tour_access_grants_tour ON guided_tour_access_grants(tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_access_grants_user ON guided_tour_access_grants(user_id);

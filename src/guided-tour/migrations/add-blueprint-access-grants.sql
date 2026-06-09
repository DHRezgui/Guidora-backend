-- Délégation admin-admin : modification et publication séparées par blueprint.
DO $$ BEGIN
  CREATE TYPE blueprint_access_mode AS ENUM ('modify', 'publish');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS organization_journey_blueprint_access_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blueprint_row_id UUID NOT NULL REFERENCES organization_journey_blueprints(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_mode blueprint_access_mode NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_blueprint_access_grant_user_mode UNIQUE (blueprint_row_id, user_id, access_mode)
);

CREATE INDEX IF NOT EXISTS idx_blueprint_access_grants_row
  ON organization_journey_blueprint_access_grants(blueprint_row_id);

CREATE INDEX IF NOT EXISTS idx_blueprint_access_grants_user
  ON organization_journey_blueprint_access_grants(user_id);

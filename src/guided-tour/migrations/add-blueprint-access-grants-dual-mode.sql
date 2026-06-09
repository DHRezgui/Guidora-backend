-- Autoriser modification ET publication pour le même administrateur (une ligne par mode).
ALTER TABLE organization_journey_blueprint_access_grants
  DROP CONSTRAINT IF EXISTS uq_blueprint_access_grant_user;

ALTER TABLE organization_journey_blueprint_access_grants
  DROP CONSTRAINT IF EXISTS uq_blueprint_access_grant_user_mode;

ALTER TABLE organization_journey_blueprint_access_grants
  ADD CONSTRAINT uq_blueprint_access_grant_user_mode
  UNIQUE (blueprint_row_id, user_id, access_mode);

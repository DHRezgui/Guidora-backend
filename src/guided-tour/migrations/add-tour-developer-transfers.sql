-- Audit des transferts de propriété développeur (admin → autre développeur).

CREATE TABLE IF NOT EXISTS guided_tour_developer_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES guided_tours(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  transferred_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_developer_transfers_tour
  ON guided_tour_developer_transfers(tour_id);

CREATE INDEX IF NOT EXISTS idx_tour_developer_transfers_org
  ON guided_tour_developer_transfers(organization_id);

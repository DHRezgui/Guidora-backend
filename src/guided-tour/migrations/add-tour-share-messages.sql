-- Messages développeur lors du partage lecture seule / collaboration sandbox.
ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS developer_view_share_message TEXT NULL;

ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS developer_view_share_message_at TIMESTAMPTZ NULL;

ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS developer_collaborate_share_message TEXT NULL;

ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS developer_collaborate_share_message_at TIMESTAMPTZ NULL;

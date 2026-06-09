-- Account privacy: developer tours hidden from admins until assigned.
ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS developer_private BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_admin_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assigned_to_admins_at TIMESTAMPTZ NULL;

-- Idempotent migration: rejection feedback for sandbox tours.

ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS sandbox_rejection_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS sandbox_rejected_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS sandbox_rejected_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;

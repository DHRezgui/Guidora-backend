-- Idempotent migration: developer message when assigning a tour to admin moderation.

ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS developer_submission_message TEXT NULL;

-- Tracks who launched sandbox test mode for a tour.
ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS sandbox_test_started_by uuid NULL;


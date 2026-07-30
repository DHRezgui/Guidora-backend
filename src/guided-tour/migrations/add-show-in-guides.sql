-- Admin opt-in: tour appears in Aide > Guides catalog (independent of /tours/active eligibility).
ALTER TABLE guided_tours
  ADD COLUMN IF NOT EXISTS show_in_guides BOOLEAN NOT NULL DEFAULT false;

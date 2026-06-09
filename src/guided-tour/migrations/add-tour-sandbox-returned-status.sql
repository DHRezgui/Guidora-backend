-- Statut « returned » : renvoi admin → développeur (après approbation), distinct du rejet.

DO $$ BEGIN
  ALTER TYPE tour_sandbox_status ADD VALUE 'returned';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

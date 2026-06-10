-- Rôle plateforme (propriétaire produit) distinct de l’ADMIN organisation cliente.
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE 'SUPER_ADMIN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTourUserStatesTable implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_user_state_status') THEN
          CREATE TYPE tour_user_state_status AS ENUM ('DISMISSED', 'COMPLETED');
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tour_user_states (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tour_id uuid NOT NULL REFERENCES guided_tours(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id uuid NOT NULL,
        status tour_user_state_status NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_tour_user_states_tour_user UNIQUE (tour_id, user_id)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tour_user_states_org_user
      ON tour_user_states (organization_id, user_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tour_user_states_tour
      ON tour_user_states (tour_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tour_user_states;`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_user_state_status') THEN
          DROP TYPE tour_user_state_status;
        END IF;
      END$$;
    `);
  }
}

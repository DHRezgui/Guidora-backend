import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTourReplayV2Fields implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_replay_policy') THEN
          CREATE TYPE tour_replay_policy AS ENUM ('never', 'after_period', 'always_on_new_version');
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'tour_user_state_status' AND e.enumlabel = 'ELIGIBLE'
        ) THEN
          ALTER TYPE tour_user_state_status ADD VALUE 'ELIGIBLE';
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      ALTER TABLE guided_tours
      ADD COLUMN IF NOT EXISTS replay_policy tour_replay_policy NOT NULL DEFAULT 'never',
      ADD COLUMN IF NOT EXISTS replay_after_days integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS current_reset_version integer NOT NULL DEFAULT 0;
    `);

    await queryRunner.query(`
      ALTER TABLE tour_user_states
      ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS next_eligible_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS reset_version integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS seen_count integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tour_user_states_next_eligible_at
      ON tour_user_states(next_eligible_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tour_user_states_next_eligible_at;`);
    await queryRunner.query(`
      ALTER TABLE tour_user_states
      DROP COLUMN IF EXISTS last_seen_at,
      DROP COLUMN IF EXISTS seen_count,
      DROP COLUMN IF EXISTS reset_version,
      DROP COLUMN IF EXISTS next_eligible_at,
      DROP COLUMN IF EXISTS expires_at;
    `);
    await queryRunner.query(`
      ALTER TABLE guided_tours
      DROP COLUMN IF EXISTS current_reset_version,
      DROP COLUMN IF EXISTS replay_after_days,
      DROP COLUMN IF EXISTS replay_policy;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tour_replay_policy') THEN
          DROP TYPE tour_replay_policy;
        END IF;
      END$$;
    `);
  }
}

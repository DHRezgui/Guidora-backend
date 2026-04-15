import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSimulationContextColumn implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE guided_tours
      ADD COLUMN IF NOT EXISTS simulation_context jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE guided_tours
      DROP COLUMN IF EXISTS simulation_context
    `);
  }
}

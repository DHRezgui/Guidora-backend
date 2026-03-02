import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBehaviorAnalysisIndexes implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index pour les requêtes par utilisateur
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_user_id 
      ON behavior_analysis(user_id)
    `);

    // Index pour les requêtes par session
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_session_id 
      ON behavior_analysis(session_id)
    `);

    // Index pour les requêtes par organisation
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_org_id 
      ON behavior_analysis(organization_id)
    `);

    // Index pour les requêtes par risque d'abandon
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_risk 
      ON behavior_analysis(abandonment_risk DESC)
    `);

    // Index pour les requêtes temporelles
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_timestamp 
      ON behavior_analysis(analyzed_at DESC)
    `);

    // Index composite pour les analyses par organisation + période
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_org_time 
      ON behavior_analysis(organization_id, analyzed_at DESC)
    `);

    // Index GIN pour la recherche dans analysis_data
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_data_gin 
      ON behavior_analysis USING GIN (analysis_data)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_analysis_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_analysis_session_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_analysis_org_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_analysis_risk`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_analysis_timestamp`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_analysis_org_time`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_analysis_data_gin`);
  }
}
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaterializedViews implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Vue : Sessions par utilisateur avec métriques agrégées
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS user_session_metrics AS
      SELECT 
        s.session_id,
        s.user_id,
        s.organization_id,
        COUNT(e.id) as event_count,
        SUM(CASE WHEN e.event_type = 'PAGE_VIEW' THEN 1 ELSE 0 END) as page_views,
        SUM(CASE WHEN e.event_type = 'CLICK' THEN 1 ELSE 0 END) as clicks,
        AVG(e.time_on_page) as avg_time_on_page,
        MAX(e.scroll_depth) as max_scroll_depth,
        COUNT(DISTINCT e.page_url) as unique_pages,
        MIN(e.timestamp) as first_event_at,
        MAX(e.timestamp) as last_event_at
      FROM behavior_events e
      JOIN (
        SELECT DISTINCT session_id, user_id, organization_id 
        FROM behavior_events
      ) s ON e.session_id = s.session_id
      GROUP BY s.session_id, s.user_id, s.organization_id
    `);

    // Vue : Analyse des frictions par page
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS page_friction_analysis AS
      SELECT 
        e.page_url,
        e.organization_id,
        COUNT(e.id) as total_events,
        COUNT(CASE WHEN e.event_type = 'CLICK' THEN 1 END) as click_count,
        COUNT(CASE WHEN e.event_type = 'HOVER' THEN 1 END) as hover_count,
        AVG(e.scroll_depth) as avg_scroll_depth,
        AVG(e.time_on_page) as avg_time_on_page,
        COUNT(CASE WHEN e.metadata->>'isError' = 'true' THEN 1 END) as error_count,
        COUNT(DISTINCT e.session_id) as unique_sessions
      FROM behavior_events e
      GROUP BY e.page_url, e.organization_id
    `);

    // Vue : Taux d'abandon par parcours
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS tour_abandonment_rates AS
      SELECT 
        t.id as tour_id,
        t.name as tour_name,
        t.organization_id,
        COUNT(DISTINCT up.user_id) as total_users,
        COUNT(DISTINCT CASE WHEN up.status = 'COMPLETED' THEN up.user_id END) as completed_users,
        COUNT(DISTINCT CASE WHEN up.status = 'ABANDONED' THEN up.user_id END) as abandoned_users,
        ROUND(
          COUNT(DISTINCT CASE WHEN up.status = 'ABANDONED' THEN up.user_id END)::DECIMAL / 
          NULLIF(COUNT(DISTINCT up.user_id), 0) * 100, 
          2
        ) as abandonment_rate,
        AVG(up.completion_rate) as avg_completion_rate
      FROM guided_tours t
      LEFT JOIN user_progress up ON t.id = up.tour_id
      GROUP BY t.id, t.name, t.organization_id
    `);

    // Index sur les vues matérialisées
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_session_metrics 
      ON user_session_metrics(session_id)
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_page_friction_analysis 
      ON page_friction_analysis(page_url, organization_id)
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tour_abandonment_rates 
      ON tour_abandonment_rates(tour_id, organization_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS user_session_metrics`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS page_friction_analysis`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS tour_abandonment_rates`);
  }
}
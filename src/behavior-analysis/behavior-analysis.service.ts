import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BehaviorEvent } from '../tracking/entities/behavior_event.entity';
import { BehaviorAnalysis } from './entities/behavior-analysis.entity';

@Injectable()
export class BehaviorAnalysisService {
  private readonly logger = new Logger(BehaviorAnalysisService.name);

  constructor(
    @InjectRepository(BehaviorEvent)
    private eventRepository: Repository<BehaviorEvent>,
    @InjectRepository(BehaviorAnalysis)
    private analysisRepository: Repository<BehaviorAnalysis>,
    private dataSource: DataSource,
  ) {}

  // Analyser une session complète et stocker les résultats
  async analyzeSession(sessionId: string, organizationId: string): Promise<BehaviorAnalysis> {
    // Récupérer tous les événements de la session
    const events = await this.eventRepository.find({
      where: { sessionId, organizationId },
      order: { timestamp: 'ASC' },
    });

    if (events.length === 0) {
      throw new Error(`Aucun événement trouvé pour la session ${sessionId}`);
    }

    // Agréger les données par page
    const pageAnalysis = this.aggregatePageData(events);

    // Calculer le risque d'abandon
    const abandonmentRisk = this.calculateAbandonmentRisk(events, pageAnalysis);
    const userId = events.find((event) => event.userId)?.userId;

    // Créer l'analyse
    const analysisPayload = {
      sessionId,
      organizationId,
      userId,
      pageUrl: events[0].pageUrl,
      timeOnPage: Math.round(pageAnalysis.avgTimeOnPage),
      scrollDepth: pageAnalysis.avgScrollDepth,
      clickMisses: pageAnalysis.clickMisses,
      hesitations: pageAnalysis.hesitations,
      abandonmentRisk,
      helpTriggered: abandonmentRisk > 0.65, // Seuil configurable
    };

    const existing = await this.analysisRepository.findOne({
      where: { sessionId, organizationId },
    });

    const analysis = existing
      ? Object.assign(existing, analysisPayload)
      : this.analysisRepository.create(analysisPayload);

    // Sauvegarder l'analyse
    const savedAnalysis = await this.analysisRepository.save(analysis);
    
    this.logger.debug(` Analyse sauvegardée pour session ${sessionId}`);
    
    return savedAnalysis;
  }

  // Analyser toutes les sessions d'une organisation
  async analyzeOrganizationSessions(organizationId: string, batchSize = 100): Promise<number> {
    // Récupérer les sessions uniques
    const sessions = await this.dataSource.query(`
      SELECT DISTINCT session_id 
      FROM behavior_events 
      WHERE organization_id = $1
    `, [organizationId]);

    let processed = 0;

    // Traiter par batch pour éviter la surcharge mémoire
    for (let i = 0; i < sessions.length; i += batchSize) {
      const batch = sessions.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (session: any) => {
          try {
            await this.analyzeSession(session.session_id, organizationId);
            processed++;
          } catch (error) {
            this.logger.error(`Erreur analyse session ${session.session_id}: ${error.message}`);
          }
        })
      );
    }

    this.logger.log(` ${processed} sessions analysées pour organisation ${organizationId}`);
    return processed;
  }

  // Préparer le dataset pour LightGBM
  async prepareMLDataset(organizationId: string): Promise<any[]> {
    const query = `
      SELECT 
        ba.session_id,
        ba.user_id,
        ba.time_on_page,
        ba.scroll_depth,
        ba.click_misses,
        ba.hesitations,
        ba.abandonment_risk,
        ba.help_triggered,
        COALESCE(up.completion_rate, 0) as completion_rate,
        COALESCE(up.status = 'ABANDONED', false) as is_abandoned,
        COUNT(DISTINCT be.id) as total_events,
        COUNT(DISTINCT CASE WHEN be.event_type = 'CLICK' THEN 1 END) as click_count,
        COUNT(DISTINCT CASE WHEN be.event_type = 'SCROLL' THEN 1 END) as scroll_count,
        COUNT(DISTINCT CASE WHEN be.event_type = 'HOVER' THEN 1 END) as hover_count
      FROM behavior_analysis ba
      LEFT JOIN user_progress up ON ba.user_id = up.user_id
      LEFT JOIN behavior_events be ON ba.session_id = be.session_id
      WHERE ba.organization_id = $1
      GROUP BY ba.id, ba.session_id, ba.user_id, ba.time_on_page, ba.scroll_depth, 
               ba.click_misses, ba.hesitations, ba.abandonment_risk, ba.help_triggered,
               up.completion_rate, up.status
      ORDER BY ba.analyzed_at DESC
    `;

    const results = await this.dataSource.query(query, [organizationId]);
    
    this.logger.log(` Dataset préparé : ${results.length} échantillons`);
    
    return results;
  }

  // Exporter les données au format CSV pour ML
  async exportMLData(organizationId: string): Promise<string> {
    const dataset = await this.prepareMLDataset(organizationId);
    
    // En-tête CSV
    const headers = [
      'session_id', 'user_id', 'time_on_page', 'scroll_depth', 'click_misses',
      'hesitations', 'abandonment_risk', 'help_triggered', 'completion_rate',
      'is_abandoned', 'total_events', 'click_count', 'scroll_count', 'hover_count'
    ].join(',');

    // Données CSV
    const rows = dataset.map(row => 
      Object.values(row).map(val => 
        typeof val === 'string' ? `"${val}"` : val
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  // Obtenir les statistiques agrégées par organisation
  async getOrganizationStats(organizationId: string): Promise<any> {
    const stats = await this.dataSource.query(`
      SELECT 
        COUNT(DISTINCT ba.session_id) as total_sessions,
        COUNT(DISTINCT ba.user_id) as total_users,
        AVG(ba.time_on_page) as avg_time_on_page,
        AVG(ba.scroll_depth) as avg_scroll_depth,
        AVG(ba.abandonment_risk) as avg_abandonment_risk,
        COUNT(CASE WHEN ba.help_triggered = true THEN 1 END) as help_triggered_count,
        COUNT(CASE WHEN ba.abandonment_risk > 0.65 THEN 1 END) as high_risk_count,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ba.time_on_page) as median_time_on_page,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ba.scroll_depth) as median_scroll_depth
      FROM behavior_analysis ba
      WHERE ba.organization_id = $1
    `, [organizationId]);

    return stats[0];
  }

  //  Obtenir les tendances temporelles
  async getTimeSeriesData(organizationId: string, days = 30): Promise<any[]> {
    const safeDays = Math.min(365, Math.max(1, Math.floor(Number(days) || 30)));
    const query = `
      SELECT 
        DATE_TRUNC('day', ba.analyzed_at) as date,
        COUNT(DISTINCT ba.session_id) as sessions,
        COUNT(DISTINCT ba.user_id) as users,
        AVG(ba.time_on_page) as avg_time_on_page,
        AVG(ba.scroll_depth) as avg_scroll_depth,
        AVG(ba.abandonment_risk) as avg_risk,
        COUNT(CASE WHEN ba.help_triggered = true THEN 1 END) as help_count
      FROM behavior_analysis ba
      WHERE ba.organization_id = $1
        AND ba.analyzed_at >= NOW() - ($2 * INTERVAL '1 day')
      GROUP BY DATE_TRUNC('day', ba.analyzed_at)
      ORDER BY date DESC
    `;

    return this.dataSource.query(query, [organizationId, safeDays]);
  }

  // Méthodes privées d'analyse

  private aggregatePageData(events: BehaviorEvent[]): any {
    const pageUrls = [...new Set(events.map(e => e.pageUrl))];
    const totalTime = events.reduce((sum, e) => sum + (e.timeOnPage || 0), 0);
    const totalScroll = events.reduce((sum, e) => sum + (e.scrollDepth || 0), 0);
    
    return {
      uniquePages: pageUrls.length,
      avgTimeOnPage: totalTime / events.length,
      avgScrollDepth: totalScroll / events.length,
      clickMisses: this.detectClickMisses(events),
      hesitations: this.detectHesitations(events),
    };
  }

  private detectClickMisses(events: BehaviorEvent[]): number {
    let misses = 0;
    
    for (let i = 0; i < events.length - 1; i++) {
      if (
        events[i].eventType === 'CLICK' &&
        events[i + 1].eventType === 'HOVER' &&
        (events[i + 1].timestamp.getTime() - events[i].timestamp.getTime()) < 2000
      ) {
        misses++;
      }
    }
    
    return misses;
  }

  private detectHesitations(events: BehaviorEvent[]): number {
    let hesitations = 0;
    const scrollEvents = events.filter(e => e.eventType === 'SCROLL');
    
    for (let i = 0; i < scrollEvents.length - 1; i++) {
      const timeDiff = scrollEvents[i + 1].timestamp.getTime() - scrollEvents[i].timestamp.getTime();
      if (timeDiff > 5000) { // Pause de plus de 5s
        hesitations++;
      }
    }
    
    return hesitations;
  }

  private calculateAbandonmentRisk(events: BehaviorEvent[], pageAnalysis: any): number {
    let riskScore = 0;
    
    // Facteur 1: Temps excessif sur page
    if (pageAnalysis.avgTimeOnPage > 120) {
      riskScore += 0.2;
    }
    
    // Facteur 2: Faible profondeur de scroll
    if (pageAnalysis.avgScrollDepth < 30) {
      riskScore += 0.15;
    }
    
    // Facteur 3: Clics manqués
    if (pageAnalysis.clickMisses > 2) {
      riskScore += 0.25;
    }
    
    // Facteur 4: Hésitations
    if (pageAnalysis.hesitations > 1) {
      riskScore += 0.2;
    }
    
    // Facteur 5: Taux d'événements par page
    const eventsPerPage = events.length / pageAnalysis.uniquePages;
    if (eventsPerPage < 2) {
      riskScore += 0.1;
    }
    
    // Normaliser entre 0 et 1
    return Math.min(riskScore, 1.0);
  }

  private countEventTypes(events: BehaviorEvent[]): Record<string, number> {
    return events.reduce((counts, event) => {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
      return counts;
    }, {});
  }

  private detectPatterns(events: BehaviorEvent[]): string[] {
    const patterns: string[] = [];
    
    // Pattern: Navigation en arrière
    const pageUrls = events.filter(e => e.eventType === 'PAGE_VIEW').map(e => e.pageUrl);
    for (let i = 1; i < pageUrls.length; i++) {
      if (pageUrls[i] === pageUrls[i - 2]) {
        patterns.push('NAVIGATION_BACK');
        break;
      }
    }
    
    // Pattern: Clics répétés sur même élément
    const clickEvents = events.filter(e => e.eventType === 'CLICK');
    const elementCounts = clickEvents.reduce<Record<string, number>>((counts, e) => {
      const key = e.elementSelector || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    
    if (Object.values(elementCounts).some(count => count > 3)) {
      patterns.push('REPEATED_CLICKS');
    }
    
    return patterns;
  }
}
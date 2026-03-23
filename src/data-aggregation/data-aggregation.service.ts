import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { BehaviorEvent } from '../tracking/entities/behavior_event.entity';
import { AggregatedData, FrictionPoint, TimeRange, UserJourneyStep } from './dto/analysis.dto';

@Injectable()
export class DataAggregationService {
  constructor(
    @InjectRepository(BehaviorEvent)
    private eventRepository: Repository<BehaviorEvent>,
  ) {}

  /**
   * Agréger les données par utilisateur
   */
  async aggregateByUser(userId: string): Promise<AggregatedData> {
    const events = await this.eventRepository.find({
      where: { userId },
      order: { timestamp: 'ASC' },
    });

    return this.processEvents(events);
  }

  /**
   * Agréger les données par session
   */
  async aggregateBySession(sessionId: string): Promise<AggregatedData> {
    const events = await this.eventRepository.find({
      where: { sessionId },
      order: { timestamp: 'ASC' },
    });

    return this.processEvents(events);
  }

  /**
   * Agréger les données par organisation et période
   */
  async aggregateByOrganization(
    organizationId: string,
    timeRange: TimeRange = '30d',
  ): Promise<AggregatedData> {
    const { startDate, endDate } = this.getDateRange(timeRange);
    
    const events = await this.eventRepository.find({
      where: {
        organizationId,
        timestamp: Between(startDate, endDate),
      },
      order: { timestamp: 'ASC' },
    });

    return this.processEvents(events);
  }

  /**
   * Traiter les événements et générer des métriques
   */
  private processEvents(events: BehaviorEvent[]): AggregatedData {
    if (events.length === 0) {
      return this.getEmptyAggregatedData();
    }

    // Calculer les métriques de base
    const metrics = {
      totalEvents: events.length,
      uniquePages: [...new Set(events.map(e => e.pageUrl))].length,
      totalTimeOnPage: events.reduce((sum, e) => sum + (e.timeOnPage || 0), 0),
      avgTimeOnPage: 0,
      totalClicks: events.filter(e => e.eventType === 'CLICK').length,
      totalScrolls: events.filter(e => e.eventType === 'SCROLL').length,
      totalHovers: events.filter(e => e.eventType === 'HOVER').length,
      clickRate: 0,
      scrollDepth: 0,
      frictionPoints: this.detectFrictionPoints(events),
      userJourney: this.buildUserJourney(events),
    };

    // Calculer les métriques dérivées
    metrics.avgTimeOnPage = metrics.totalTimeOnPage / events.length;
    metrics.clickRate = metrics.totalClicks / metrics.totalEvents;
    metrics.scrollDepth = events.reduce((max, e) => Math.max(max, e.scrollDepth || 0), 0);

    return {
      ...metrics,
      events,
      analyzedAt: new Date(),
    };
  }

  /**
   * Détecter les points de friction
   */
  private detectFrictionPoints(events: BehaviorEvent[]): FrictionPoint[] {
    const frictions: FrictionPoint[] = [];

    // Détection des clics manqués
    for (let i = 0; i < events.length - 1; i++) {
      if (
        events[i].eventType === 'CLICK' &&
        events[i + 1].eventType === 'HOVER' &&
        (events[i + 1].timestamp.getTime() - events[i].timestamp.getTime()) < 2000
      ) {
        frictions.push({
          type: 'CLICK_MISSED',
          timestamp: events[i].timestamp,
          pageUrl: events[i].pageUrl,
          elementSelector: events[i].elementSelector,
        });
      }
    }

    // Détection des hésitations (scroll lent)
    const scrollEvents = events.filter(e => e.eventType === 'SCROLL');
    for (let i = 0; i < scrollEvents.length - 1; i++) {
      const timeDiff = scrollEvents[i + 1].timestamp.getTime() - scrollEvents[i].timestamp.getTime();
      if (timeDiff > 5000) { // Pause de plus de 5s
        frictions.push({
          type: 'SCROLL_HESITATION',
          timestamp: scrollEvents[i].timestamp,
          pageUrl: scrollEvents[i].pageUrl,
          duration: timeDiff,
        });
      }
    }

    // Détection du temps excessif sur page
    const pageViewEvents = events.filter(e => e.eventType === 'PAGE_VIEW');
    pageViewEvents.forEach(event => {
      if (event.timeOnPage && event.timeOnPage > 120) { // Plus de 2 minutes
        frictions.push({
          type: 'EXCESSIVE_TIME_ON_PAGE',
          timestamp: event.timestamp,
          pageUrl: event.pageUrl,
          duration: event.timeOnPage,
        });
      }
    });

    return frictions;
  }

  /**
   * Construire le parcours utilisateur
   */
  private buildUserJourney(events: BehaviorEvent[]): UserJourneyStep[] {
    const journey: UserJourneyStep[] = [];
    let currentStep: UserJourneyStep | null = null;

    events.forEach((event, index) => {
      if (event.eventType === 'PAGE_VIEW') {
        // Nouvelle étape de parcours
        if (currentStep) {
          journey.push(currentStep);
        }

        currentStep = {
          stepNumber: journey.length + 1,
          pageUrl: event.pageUrl,
          entryTime: event.timestamp,
          exitTime: null,
          duration: 0,
          interactions: [],
        };
      }

      if (currentStep) {
        // Ajouter l'interaction à l'étape courante
        currentStep.interactions.push({
          type: event.eventType,
          timestamp: event.timestamp,
          elementSelector: event.elementSelector,
          elementText: event.elementText,
        });

        // Mettre à jour le temps de sortie
        if (index === events.length - 1 || events[index + 1].eventType === 'PAGE_VIEW') {
          currentStep.exitTime = event.timestamp;
          currentStep.duration = (event.timestamp.getTime() - currentStep.entryTime.getTime()) / 1000;
          journey.push(currentStep);
          currentStep = null;
        }
      }
    });

    return journey;
  }

  /**
   * Obtenir une plage de dates
   */
  private getDateRange(timeRange: TimeRange): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    return { startDate, endDate };
  }

  /**
   * Données agrégées vides
   */
  private getEmptyAggregatedData(): AggregatedData {
    return {
      totalEvents: 0,
      uniquePages: 0,
      totalTimeOnPage: 0,
      avgTimeOnPage: 0,
      totalClicks: 0,
      totalScrolls: 0,
      totalHovers: 0,
      clickRate: 0,
      scrollDepth: 0,
      frictionPoints: [],
      userJourney: [],
      events: [],
      analyzedAt: new Date(),
    };
  }
}

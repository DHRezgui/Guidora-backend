import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { BehaviorEvent } from './entities/behavior_event.entity';
import { TrackEventDto } from './dto/track-event.dto';
import { EventType } from './enums/tracking.enums';
import { OrganizationService } from '../organization/organization.service';

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(BehaviorEvent)
    private eventRepository: Repository<BehaviorEvent>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private organizationService: OrganizationService,
  ) {}

  // Enregistrer un événement unique
  async trackEvent(trackEventDto: TrackEventDto): Promise<BehaviorEvent> {
    // Valider l'organisation
    await this.organizationService.findById(trackEventDto.organizationId);

    // Créer l'événement
    const event = this.eventRepository.create({
      ...trackEventDto,
      timestamp: new Date(),
    });

    // Sauvegarder dans PostgreSQL
    const savedEvent = await this.eventRepository.save(event);

    // Mettre à jour la session dans Redis
    await this.updateSessionCache(trackEventDto.sessionId, trackEventDto);

    return savedEvent;
  }

  // Enregistrer un batch d'événements
  async trackBatch(eventsDto: TrackEventDto[]): Promise<BehaviorEvent[]> {
    // Valider toutes les organisations
    const organizationIds = [...new Set(eventsDto.map(e => e.organizationId))];
    await Promise.all(
      organizationIds.map(orgId => this.organizationService.findById(orgId)),
    );

    // Créer tous les événements
    const events = eventsDto.map(dto =>
      this.eventRepository.create({
        ...dto,
        timestamp: new Date(),
      }),
    );

    // Sauvegarder en batch (plus performant)
    const savedEvents = await this.eventRepository.save(events);

    // Mettre à jour les sessions dans Redis
    await Promise.all(
      eventsDto.map(dto => this.updateSessionCache(dto.sessionId, dto)),
    );

    return savedEvents;
  }

  // Mettre à jour le cache Redis pour une session
  private async updateSessionCache(sessionId: string, eventData: TrackEventDto): Promise<void> {
    if (!this.redis) return;
    const cacheKey = `session:${sessionId}`;
    const sessionData = await this.redis.get(cacheKey);

    let session = sessionData ? JSON.parse(sessionData) : {
      sessionId,
      organizationId: eventData.organizationId,
      userId: eventData.userId,
      firstEventAt: new Date().toISOString(),
      lastEventAt: new Date().toISOString(),
      eventCount: 0,
      pageViews: [],
      totalTimeOnPage: 0,
    };

    // Mettre à jour les statistiques
    session.lastEventAt = new Date().toISOString();
    session.eventCount += 1;
    session.totalTimeOnPage += eventData.timeOnPage || 0;

    // Suivre les pages visitées
    if (eventData.eventType === EventType.PAGE_VIEW && !session.pageViews.includes(eventData.pageUrl)) {
      session.pageViews.push(eventData.pageUrl);
    }

    // Sauvegarder dans Redis (expire après 24h)
    await this.redis.setex(cacheKey, 86400, JSON.stringify(session));
  }

  // Récupérer les données d'une session
  async getSessionData(sessionId: string): Promise<any> {
    if (!this.redis) return null;
    const cacheKey = `session:${sessionId}`;
    const sessionData = await this.redis.get(cacheKey);
    return sessionData ? JSON.parse(sessionData) : null;
  }

  // Trouver les événements par utilisateur
  async findEventsByUser(userId: string, limit: number = 100): Promise<BehaviorEvent[]> {
    return this.eventRepository.find({
      where: { userId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  // Trouver les événements par session
  async findEventsBySession(sessionId: string, limit: number = 100): Promise<BehaviorEvent[]> {
    return this.eventRepository.find({
      where: { sessionId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  // Trouver les événements par organisation avec filtres
  async findEventsByOrganization(
    organizationId: string,
    filters: {
      eventType?: EventType;
      startDate?: Date;
      endDate?: Date;
      pageUrl?: string;
      limit?: number;
    },
  ): Promise<BehaviorEvent[]> {
    const query = this.eventRepository
      .createQueryBuilder('event')
      .where('event.organizationId = :organizationId', { organizationId })
      .orderBy('event.timestamp', 'DESC');

    if (filters.eventType) {
      query.andWhere('event.eventType = :eventType', { eventType: filters.eventType });
    }

    if (filters.startDate) {
      query.andWhere('event.timestamp >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      query.andWhere('event.timestamp <= :endDate', { endDate: filters.endDate });
    }

    if (filters.pageUrl) {
      query.andWhere('event.pageUrl LIKE :pageUrl', { pageUrl: `%${filters.pageUrl}%` });
    }

    if (filters.limit) {
      query.limit(filters.limit);
    }

    return query.getMany();
  }

  // Analyser les frictions dans une session
  async analyzeSessionFrictions(sessionId: string): Promise<any> {
    const events = await this.findEventsBySession(sessionId, 1000);
    
    const frictions = {
      clickMisses: 0,
      scrollHesitations: 0,
      excessiveTimeOnPage: 0,
      formAbandonments: 0,
      navigationBacks: 0,
    };

    // Analyser les clics manqués (CLICK suivi de HOVER rapide)
    for (let i = 0; i < events.length - 1; i++) {
      if (
        events[i].eventType === EventType.CLICK &&
        events[i + 1].eventType === EventType.HOVER &&
        (events[i + 1].timestamp.getTime() - events[i].timestamp.getTime()) < 2000
      ) {
        frictions.clickMisses++;
      }
    }

    // Analyser les hésitations de scroll (scroll lent + pauses)
    const scrollEvents = events.filter(e => e.eventType === EventType.SCROLL);
    for (let i = 0; i < scrollEvents.length - 1; i++) {
      const timeDiff = scrollEvents[i + 1].timestamp.getTime() - scrollEvents[i].timestamp.getTime();
      if (timeDiff > 5000) { // Pause de plus de 5s
        frictions.scrollHesitations++;
      }
    }

    // Analyser le temps excessif sur page
    const pageViewEvents = events.filter(e => e.eventType === EventType.PAGE_VIEW);
    pageViewEvents.forEach(event => {
      if (event.timeOnPage && event.timeOnPage > 120) { // Plus de 2 minutes
        frictions.excessiveTimeOnPage++;
      }
    });

    return frictions;
  }
}
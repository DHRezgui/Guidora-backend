import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContextualFeedbackAggregate } from './entities/contextual-feedback-aggregate.entity';
import {
  ContextualFeedbackEventDto,
  ContextualFeedbackEventType,
  SubmitContextualFeedbackDto,
} from './dto/submit-contextual-feedback.dto';

const COUNTER_CAP = 100_000;

export interface ContextualFeedbackAggregateView {
  targetUrl: string;
  selector: string;
  intent: string;
  shown: number;
  clicked: number;
  completed: number;
  skipped: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

@Injectable()
export class ContextualFeedbackService {
  private readonly logger = new Logger(ContextualFeedbackService.name);

  constructor(
    @InjectRepository(ContextualFeedbackAggregate)
    private readonly repo: Repository<ContextualFeedbackAggregate>,
  ) {}

  async ingestBatch(
    organizationId: string,
    dto: SubmitContextualFeedbackDto,
  ): Promise<{ accepted: number; deduped: number }> {
    const merged = this.mergeBatch(dto.events);
    let accepted = 0;
    let deduped = 0;

    for (const { key, deltas } of merged) {
      const existing = await this.repo.findOne({
        where: {
          organizationId,
          targetUrl: key.targetUrl,
          selector: key.selector,
          intent: key.intent,
        },
      });

      if (existing) {
        existing.shownCount = this.bounded(existing.shownCount + deltas.shown);
        existing.clickedCount = this.bounded(existing.clickedCount + deltas.clicked);
        existing.completedCount = this.bounded(existing.completedCount + deltas.completed);
        existing.skippedCount = this.bounded(existing.skippedCount + deltas.skipped);
        await this.repo.save(existing);
        accepted += deltas.shown + deltas.clicked + deltas.completed + deltas.skipped;
      } else {
        const created = this.repo.create({
          organizationId,
          targetUrl: key.targetUrl,
          selector: key.selector,
          intent: key.intent,
          shownCount: this.bounded(deltas.shown),
          clickedCount: this.bounded(deltas.clicked),
          completedCount: this.bounded(deltas.completed),
          skippedCount: this.bounded(deltas.skipped),
        });
        await this.repo.save(created);
        accepted += deltas.shown + deltas.clicked + deltas.completed + deltas.skipped;
      }
    }

    if (deduped > 0) {
      this.logger.debug(`Deduped ${deduped} events in batch for org ${organizationId}`);
    }

    return { accepted, deduped };
  }

  async getAggregates(
    organizationId: string,
    options?: { targetUrl?: string; limit?: number },
  ): Promise<ContextualFeedbackAggregateView[]> {
    const limit = Math.max(1, Math.min(options?.limit ?? 500, 2000));
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.organization_id = :organizationId', { organizationId });

    if (options?.targetUrl) {
      qb.andWhere('a.target_url = :targetUrl', { targetUrl: options.targetUrl });
    }

    const rows = await qb
      .orderBy('a.last_seen_at', 'DESC')
      .limit(limit)
      .getMany();

    return rows.map((row) => ({
      targetUrl: row.targetUrl,
      selector: row.selector,
      intent: row.intent,
      shown: row.shownCount,
      clicked: row.clickedCount,
      completed: row.completedCount,
      skipped: row.skippedCount,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
    }));
  }

  private bounded(value: number): number {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.min(COUNTER_CAP, Math.round(value));
  }

  private mergeBatch(events: ContextualFeedbackEventDto[]): Array<{
    key: { targetUrl: string; selector: string; intent: string };
    deltas: { shown: number; clicked: number; completed: number; skipped: number };
  }> {
    const map = new Map<
      string,
      {
        key: { targetUrl: string; selector: string; intent: string };
        deltas: { shown: number; clicked: number; completed: number; skipped: number };
      }
    >();

    for (const event of events) {
      const selector = (event.selector ?? '').trim() || '__unknown__';
      const intent = event.intent.trim().toLowerCase();
      const targetUrl = event.targetUrl.trim();
      const compositeKey = `${targetUrl}\u0000${selector}\u0000${intent}`;
      const delta = Math.max(1, Math.min(event.count ?? 1, 100));

      const entry = map.get(compositeKey) ?? {
        key: { targetUrl, selector, intent },
        deltas: { shown: 0, clicked: 0, completed: 0, skipped: 0 },
      };

      switch (event.event) {
        case ContextualFeedbackEventType.SHOWN:
          entry.deltas.shown += delta;
          break;
        case ContextualFeedbackEventType.CLICKED:
          entry.deltas.clicked += delta;
          break;
        case ContextualFeedbackEventType.COMPLETED:
          entry.deltas.completed += delta;
          break;
        case ContextualFeedbackEventType.SKIPPED:
          entry.deltas.skipped += delta;
          break;
      }

      map.set(compositeKey, entry);
    }

    return Array.from(map.values());
  }
}

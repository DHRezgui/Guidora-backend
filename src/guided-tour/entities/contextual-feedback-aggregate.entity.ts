import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { Organization } from '../../organization/entities/organization.entity';

/**
 * Aggregated counts of contextual tour feedback events per
 * (organization, targetUrl, selector, intent). One row per unique combination;
 * SDK clients push deltas via `POST /tours/contextual/feedback` and these
 * counters are incremented atomically (upsert).
 *
 * Counts are intentionally bounded server-side (see service), to keep ratios
 * meaningful and avoid runaway storage. Optional `lastSeenAt` lets the SDK
 * apply temporal decay when consuming aggregates in scoring.
 */
@Entity('contextual_feedback_aggregates')
@Unique('uq_contextual_feedback_key', [
  'organizationId',
  'targetUrl',
  'selector',
  'intent',
])
@Index('idx_contextual_feedback_org_url', ['organizationId', 'targetUrl'])
export class ContextualFeedbackAggregate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 500, name: 'target_url' })
  targetUrl: string;

  @Column({ type: 'varchar', length: 1024 })
  selector: string;

  @Column({ type: 'varchar', length: 64 })
  intent: string;

  @Column({ type: 'int', default: 0, name: 'shown_count' })
  shownCount: number;

  @Column({ type: 'int', default: 0, name: 'clicked_count' })
  clickedCount: number;

  @Column({ type: 'int', default: 0, name: 'completed_count' })
  completedCount: number;

  @Column({ type: 'int', default: 0, name: 'skipped_count' })
  skippedCount: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'first_seen_at' })
  firstSeenAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'last_seen_at' })
  lastSeenAt: Date;
}

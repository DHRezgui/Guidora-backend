import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Organization } from '../../organization/entities/organization.entity';

@Entity('behavior_analysis')
export class BehaviorAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid', nullable: false, name: 'session_id' })
  sessionId: string;

  @Column({ type: 'uuid', nullable: false, name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 500, nullable: false, name: 'page_url' })
  pageUrl: string;

  @Column({ type: 'int', default: 0, name: 'time_on_page' })
  timeOnPage: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0.0, name: 'scroll_depth' })
  scrollDepth: number;

  @Column({ type: 'int', default: 0, name: 'click_misses' })
  clickMisses: number;

  @Column({ type: 'int', default: 0, name: 'hesitations' })
  hesitations: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.0, name: 'abandonment_risk' })
  abandonmentRisk: number;

  @Column({ type: 'boolean', default: false, name: 'help_triggered' })
  helpTriggered: boolean;

  // NOTE: kept as transient field for compatibility with existing services.
  // The current database schema does not have `analysis_data` column.
  analysisData?: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz', name: 'analyzed_at' })
  analyzedAt: Date;
}
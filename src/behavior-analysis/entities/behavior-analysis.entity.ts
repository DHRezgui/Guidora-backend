import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Organization } from '../../organization/entities/organization.entity';

@Entity('behavior_analysis')
export class BehaviorAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid', nullable: false })
  sessionId: string;

  @Column({ type: 'uuid', nullable: false })
  organizationId: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 500, nullable: false })
  pageUrl: string;

  @Column({ type: 'int', default: 0 })
  timeOnPage: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0.00 })
  scrollDepth: number;

  @Column({ type: 'int', default: 0 })
  clickMisses: number;

  @Column({ type: 'int', default: 0 })
  hesitations: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.0000 })
  abandonmentRisk: number;

  @Column({ type: 'boolean', default: false })
  helpTriggered: boolean;

  @Column({ type: 'jsonb', default: {} })
  analysisData: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz', name: 'analyzed_at' })
  analyzedAt: Date;
}
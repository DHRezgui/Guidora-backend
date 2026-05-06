import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Organization } from '../../organization/entities/organization.entity';
import { User } from '../../user/entities/user.entity';
import { Step } from '../../step/entities/step.entity';

export enum TourReplayPolicy {
  NEVER = 'never',
  AFTER_PERIOD = 'after_period',
  ALWAYS_ON_NEW_VERSION = 'always_on_new_version',
}

@Entity('guided_tours')
export class GuidedTour {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 500 , name: 'target_url' })
  targetUrl: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'jsonb', default: {}, name: 'trigger_conditions' })
  triggerConditions: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true, name: 'simulation_context' })
  simulationContext?: Record<string, any>;

  @Column({
    type: 'enum',
    enum: TourReplayPolicy,
    enumName: 'tour_replay_policy',
    name: 'replay_policy',
    default: TourReplayPolicy.NEVER,
  })
  replayPolicy: TourReplayPolicy;

  @Column({ type: 'int', name: 'replay_after_days', default: 0 })
  replayAfterDays: number;

  @Column({ type: 'int', name: 'current_reset_version', default: 0 })
  currentResetVersion: number;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @OneToMany(() => Step, (step) => step.tour, { cascade: true, eager: true })
  steps: Step[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
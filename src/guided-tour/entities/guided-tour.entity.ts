import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Organization } from '../../organization/entities/organization.entity';
import { User } from '../../user/entities/user.entity';
import { Step } from '../../step/entities/step.entity';
import { GuidedTourAccessGrant } from './guided-tour-access-grant.entity';
import type { TourEditLockInfo } from '../guided-tour-edit-lock.util';

export enum TourReplayPolicy {
  NEVER = 'never',
  AFTER_PERIOD = 'after_period',
  ALWAYS_ON_NEW_VERSION = 'always_on_new_version',
}

export enum TourEnvironment {
  SANDBOX = 'sandbox',
  PRODUCTION = 'production',
}

export enum TourSandboxStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  RETURNED = 'returned',
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

  /** Opt-in admin : catalogue Aide > Guides (indépendant de l’autostart /tours/active). */
  @Column({ type: 'boolean', default: false, name: 'show_in_guides' })
  showInGuides: boolean;

  /** Visible en runtime sandbox pour les admins (parcours déjà en production). */
  @Column({ type: 'boolean', default: false, name: 'is_sandbox_test_active' })
  isSandboxTestActive: boolean;

  /** Utilisateur ayant lancé le test sandbox en cours (avant/après approbation). */
  @Column({ type: 'uuid', nullable: true, name: 'sandbox_test_started_by' })
  sandboxTestStartedBy?: string | null;

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

  @Column({
    type: 'enum',
    enum: TourEnvironment,
    enumName: 'tour_environment',
    default: TourEnvironment.PRODUCTION,
  })
  environment: TourEnvironment;

  @Column({
    type: 'enum',
    enum: TourSandboxStatus,
    enumName: 'tour_sandbox_status',
    name: 'sandbox_status',
    nullable: true,
  })
  sandboxStatus?: TourSandboxStatus | null;

  @Column({ type: 'text', nullable: true, name: 'sandbox_rejection_reason' })
  sandboxRejectionReason?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'sandbox_rejected_at' })
  sandboxRejectedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'sandbox_rejected_by' })
  sandboxRejectedBy?: string | null;

  /** Message du développeur lors de l’assignation à un administrateur modérateur. */
  @Column({ type: 'text', nullable: true, name: 'developer_submission_message' })
  developerSubmissionMessage?: string | null;

  /** Message du développeur lors du partage lecture seule. */
  @Column({ type: 'text', nullable: true, name: 'developer_view_share_message' })
  developerViewShareMessage?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'developer_view_share_message_at' })
  developerViewShareMessageAt?: Date | null;

  /** Message du développeur lors de l’activation collaboration sandbox. */
  @Column({ type: 'text', nullable: true, name: 'developer_collaborate_share_message' })
  developerCollaborateShareMessage?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'developer_collaborate_share_message_at' })
  developerCollaborateShareMessageAt?: Date | null;

  /** Parcours développeur masqué des admins jusqu’à assignation explicite. */
  @Column({ type: 'boolean', default: false, name: 'developer_private' })
  developerPrivate: boolean;

  @Column({ type: 'uuid', array: true, default: () => "'{}'", name: 'assigned_admin_ids' })
  assignedAdminIds: string[];

  /** Admin gestionnaire unique en production (parcours admin) ; défaut = créateur. */
  @Column({ type: 'uuid', nullable: true, name: 'production_managed_by_admin_id' })
  productionManagedByAdminId?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'assigned_to_admins_at' })
  assignedToAdminsAt?: Date | null;

  /** Collaboration sandbox active (admins assignés agissent comme développeurs, pas modérateurs). */
  @Column({ type: 'boolean', default: false, name: 'in_collaboration' })
  inCollaboration: boolean;

  /** Verrou d'édition exclusif (collaboration multi-utilisateurs). */
  @Column({ type: 'uuid', nullable: true, name: 'edit_locked_by' })
  editLockedBy?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'edit_locked_at' })
  editLockedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'edit_lock_expires_at' })
  editLockExpiresAt?: Date | null;

  /** Grants de partage — chargés manuellement dans GuidedTourService (pas de @OneToMany). */
  accessGrants?: GuidedTourAccessGrant[];

  /** Au moins un grant lecture seule (réponse API, non persisté). */
  sharingHasView?: boolean;

  /** Collaboration sandbox partagée (grant collaborate ou inCollaboration). */
  sharingHasCollaborate?: boolean;

  /** État du verrou d’édition (réponse API, non persisté). */
  editLock?: TourEditLockInfo;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @OneToMany(() => Step, (step) => step.tour, { cascade: true })
  steps: Step[];

  /** Renseigné par loadRelationCountAndMap en mode liste allégée. */
  stepCount?: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organization/entities/organization.entity';
import { User } from '../../user/entities/user.entity';

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum PriorityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

/** Admin reply sent by email from the dashboard (model B). */
export type SupportTicketAdminReply = {
  body: string;
  sentAt: string;
  authorId: string | null;
  authorEmail?: string | null;
  authorName?: string | null;
};

export type SupportCollaboratorAccess = 'read' | 'write';

/** Developer collaboration on an assigned ticket. */
export type SupportTicketCollaborator = {
  userId: string;
  access: SupportCollaboratorAccess;
  addedAt: string;
  addedBy: string | null;
};

/** Append-only lifecycle / ownership audit trail. */
export type SupportTicketHistoryKind =
  | 'created'
  | 'status'
  | 'assignment'
  | 'takeover'
  | 'unassign'
  | 'archive'
  | 'unarchive'
  | 'reopen';

export type SupportTicketHistoryEntry = {
  id: string;
  at: string;
  kind: SupportTicketHistoryKind;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  fromStatus?: TicketStatus | null;
  toStatus?: TicketStatus | null;
  fromAssigneeId?: string | null;
  fromAssigneeLabel?: string | null;
  toAssigneeId?: string | null;
  toAssigneeLabel?: string | null;
};

@Entity('support_tickets')
@Index('idx_tickets_org_id', ['organizationId'])
@Index('idx_tickets_user_id', ['userId'])
@Index('idx_tickets_status', ['status'])
@Index('idx_tickets_priority', ['priority'])
@Index('idx_tickets_assigned', ['assignedTo'])
@Index('idx_tickets_org_project', ['organizationId', 'projectKey'])
@Index('idx_tickets_edit_lock_expires', ['editLockExpiresAt'])
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enumName: 'ticket_status',
    enum: TicketStatus,
    default: TicketStatus.OPEN,
  })
  status: TicketStatus;

  @Column({
    type: 'enum',
    enumName: 'priority_level',
    enum: PriorityLevel,
    default: PriorityLevel.MEDIUM,
  })
  priority: PriorityLevel;

  @Column({ type: 'uuid', name: 'assigned_to', nullable: true })
  assignedTo: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignee: User | null;

  /** Set whenever `assignedTo` changes — used for take-over cooldown. */
  @Column({ type: 'timestamptz', name: 'assigned_at', nullable: true })
  assignedAt: Date | null;

  @Column({ type: 'varchar', length: 500, name: 'page_url', nullable: true })
  pageUrl: string | null;

  /** Scopes tickets to a host app / flow (aligns with SDK `flowVersion` / FAQ `projectKey`). */
  @Column({ type: 'varchar', length: 120, name: 'project_key', default: 'default' })
  projectKey: string;

  @Column({ type: 'jsonb', name: 'session_data', default: () => "'{}'" })
  sessionData: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'admin_replies', default: () => "'[]'" })
  adminReplies: SupportTicketAdminReply[];

  /** Collaborating developers (read or write) — never includes the primary assignee. */
  @Column({ type: 'jsonb', name: 'collaborators', default: () => "'[]'" })
  collaborators: SupportTicketCollaborator[];

  /** Append-only audit trail (assignment + status lifecycle). */
  @Column({ type: 'jsonb', name: 'lifecycle_history', default: () => "'[]'" })
  lifecycleHistory: SupportTicketHistoryEntry[];

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt: Date | null;

  /** Soft delete — ticket hidden from dashboard lists (org ADMIN only). */
  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'uuid', name: 'deleted_by', nullable: true })
  deletedBy: string | null;

  @Column({ type: 'uuid', name: 'edit_locked_by', nullable: true })
  editLockedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'edit_locked_by' })
  editLockHolder: User | null;

  @Column({ type: 'timestamptz', name: 'edit_locked_at', nullable: true })
  editLockedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'edit_lock_expires_at', nullable: true })
  editLockExpiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

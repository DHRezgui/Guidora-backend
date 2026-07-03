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
import type { FaqEditLockInfo } from '../faq-edit-lock.util';

@Entity('faq_items')
@Index('idx_faq_org_id', ['organizationId'])
@Index('idx_faq_active', ['isActive'])
@Index('idx_faq_org_project', ['organizationId', 'projectKey'])
export class FaqItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  /** Scopes FAQ entries to a host app / flow (aligns with SDK `flowVersion`). */
  @Column({ type: 'varchar', length: 120, name: 'project_key', default: 'default' })
  projectKey: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', array: true, default: () => 'ARRAY[]::varchar[]' })
  tags: string[];

  @Column({ type: 'int', name: 'view_count', default: 0 })
  viewCount: number;

  @Column({ type: 'int', name: 'helpful_count', default: 0 })
  helpfulCount: number;

  @Column({ type: 'int', name: 'not_helpful_count', default: 0 })
  notHelpfulCount: number;

  /** Published entries are included in semantic search for the organization. */
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', name: 'edit_locked_by', nullable: true })
  editLockedBy: string | null;

  @Column({ type: 'timestamptz', name: 'edit_locked_at', nullable: true })
  editLockedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'edit_lock_expires_at', nullable: true })
  editLockExpiresAt: Date | null;

  /** Renseigné côté API (non persisté). */
  editLock?: FaqEditLockInfo;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  /** Last change to fields that affect semantic embeddings (not views/feedback/edit-lock). */
  @Column({ type: 'timestamptz', name: 'content_updated_at', default: () => 'NOW()' })
  contentUpdatedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

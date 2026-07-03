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
import { User } from '../../user/entities/user.entity';
import type { BlueprintEditLockInfo } from '../blueprint-edit-lock.util';
import type { OrganizationJourneyBlueprintAccessGrant } from './organization-journey-blueprint-access-grant.entity';

/**
 * Dashboard-managed journey blueprint stored per organization.
 * Published rows are exposed via `GET /tours/contextual/blueprints` for the SDK.
 */
@Entity('organization_journey_blueprints')
@Unique('uq_org_journey_blueprint_id', ['organizationId', 'blueprintId'])
@Index('idx_org_journey_blueprints_org_published', ['organizationId', 'isPublished'])
export class OrganizationJourneyBlueprint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  /** Stable blueprint id inside payload (`JourneyBlueprint.id`). */
  @Column({ type: 'varchar', length: 128, name: 'blueprint_id' })
  blueprintId: string;

  @Column({ type: 'varchar', length: 32 })
  vertical: string;

  /** SDK project key — aligns with FAQ `project_key` and contextual `flowVersion`. */
  @Column({ type: 'varchar', length: 120, name: 'project_key', default: 'default' })
  projectKey: string;

  @Column({ type: 'boolean', name: 'is_published', default: false })
  isPublished: boolean;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @Column({ type: 'uuid', name: 'edit_locked_by', nullable: true })
  editLockedBy: string | null;

  @Column({ type: 'timestamptz', name: 'edit_locked_at', nullable: true })
  editLockedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'edit_lock_expires_at', nullable: true })
  editLockExpiresAt: Date | null;

  /** Renseigné côté API (non persisté). */
  editLock?: BlueprintEditLockInfo;

  /** Grants de l’acteur courant ou liste complète (détail). */
  accessGrants?: OrganizationJourneyBlueprintAccessGrant[];

  /** Résumé partage (liste dashboard). */
  sharingHasModify?: boolean;

  sharingHasPublish?: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

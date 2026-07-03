import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Organization } from '../../organization/entities/organization.entity';

/** Registered FAQ pack for an organization (may exist with zero questions). */
@Entity('faq_projects')
@Unique('uq_faq_projects_org_key', ['organizationId', 'projectKey'])
@Index('idx_faq_projects_org', ['organizationId'])
export class FaqProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 120, name: 'project_key' })
  projectKey: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../../organization/entities/organization.entity';
import { User } from '../../user/entities/user.entity';

@Entity('sdk_integration_tokens')
@Index('idx_sdk_tokens_org_active', ['organizationId', 'revokedAt'])
export class SdkIntegrationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 64, name: 'token_hash', unique: true })
  tokenHash: string;

  /** Last 8 chars of secret segment — shown in list for identification. */
  @Column({ type: 'varchar', length: 12, name: 'token_suffix' })
  tokenSuffix: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  scopes: string[];

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'last_used_at', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

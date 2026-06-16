import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SdkIntegrationTokenAuditEvent =
  | 'created'
  | 'revoked'
  | 'used'
  | 'exchanged'
  | 'session_used';

@Entity('sdk_integration_token_audit')
@Index('idx_sdk_token_audit_org_created', ['organizationId', 'createdAt'])
@Index('idx_sdk_token_audit_token', ['tokenId'])
export class SdkIntegrationTokenAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'uuid', name: 'token_id', nullable: true })
  tokenId: string | null;

  @Column({ type: 'uuid', name: 'session_token_id', nullable: true })
  sessionTokenId: string | null;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'varchar', length: 32, name: 'event_type' })
  eventType: SdkIntegrationTokenAuditEvent;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 512, name: 'user_agent', nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

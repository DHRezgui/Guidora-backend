import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('sdk_session_tokens')
@Index('idx_sdk_session_tokens_parent', ['parentTokenId'])
@Index('idx_sdk_session_tokens_expires', ['expiresAt'])
export class SdkSessionToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'parent_token_id' })
  parentTokenId: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @Column({ type: 'varchar', length: 64, name: 'token_hash', unique: true })
  tokenHash: string;

  @Column({ type: 'varchar', length: 12, name: 'token_suffix' })
  tokenSuffix: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  scopes: string[];

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'last_used_at', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

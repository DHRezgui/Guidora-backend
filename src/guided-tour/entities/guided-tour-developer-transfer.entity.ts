import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('guided_tour_developer_transfers')
export class GuidedTourDeveloperTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tour_id' })
  tourId: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'uuid', name: 'from_user_id' })
  fromUserId: string;

  @Column({ type: 'uuid', name: 'to_user_id' })
  toUserId: string;

  @Column({ type: 'uuid', name: 'transferred_by' })
  transferredBy: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

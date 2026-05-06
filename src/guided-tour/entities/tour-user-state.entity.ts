import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { GuidedTour } from './guided-tour.entity';
import { User } from '../../user/entities/user.entity';

export enum TourUserStateStatus {
  DISMISSED = 'DISMISSED',
  COMPLETED = 'COMPLETED',
  ELIGIBLE = 'ELIGIBLE',
}

@Entity('tour_user_states')
@Index('idx_tour_user_states_tour_user_unique', ['tourId', 'userId'], { unique: true })
export class TourUserState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tour_id' })
  tourId: string;

  @ManyToOne(() => GuidedTour, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tour_id' })
  tour: GuidedTour;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({
    type: 'enum',
    enumName: 'tour_user_state_status',
    enum: TourUserStateStatus,
    name: 'status',
  })
  status: TourUserStateStatus;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'next_eligible_at', nullable: true })
  nextEligibleAt?: Date | null;

  @Column({ type: 'int', name: 'reset_version', default: 0 })
  resetVersion: number;

  @Column({ type: 'int', name: 'seen_count', default: 0 })
  seenCount: number;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  lastSeenAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

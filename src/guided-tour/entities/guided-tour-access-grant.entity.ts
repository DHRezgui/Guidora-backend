import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import type { User } from '../../user/entities/user.entity';

export enum TourAccessMode {
  VIEW = 'view',
  COLLABORATE = 'collaborate',
}

@Entity('guided_tour_access_grants')
export class GuidedTourAccessGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tour_id' })
  tourId: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  /** Renseigné par le service (pas de relation TypeORM — évite les conflits joinColumns). */
  user?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;

  @Column({
    type: 'enum',
    enum: TourAccessMode,
    enumName: 'tour_access_mode',
    name: 'access_mode',
  })
  accessMode: TourAccessMode;

  @Column({ type: 'uuid', nullable: true, name: 'granted_by' })
  grantedBy?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

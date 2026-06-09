import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import type { User } from '../../user/entities/user.entity';

export enum BlueprintAccessMode {
  MODIFY = 'modify',
  PUBLISH = 'publish',
}

@Entity('organization_journey_blueprint_access_grants')
@Unique('uq_blueprint_access_grant_user_mode', ['blueprintRowId', 'userId', 'accessMode'])
export class OrganizationJourneyBlueprintAccessGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'blueprint_row_id' })
  blueprintRowId: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  /** Renseigné par le service (pas de relation TypeORM). */
  user?: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;

  @Column({
    type: 'enum',
    enum: BlueprintAccessMode,
    enumName: 'blueprint_access_mode',
    name: 'access_mode',
  })
  accessMode: BlueprintAccessMode;

  @Column({ type: 'uuid', nullable: true, name: 'granted_by' })
  grantedBy?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

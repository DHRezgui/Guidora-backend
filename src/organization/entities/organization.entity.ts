import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum PlanType {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: false, name: 'api_key' })
  apiKey: string;

  @Column({
    type: 'enum',
    enumName: 'plan_type',
    enum: PlanType,
    default: PlanType.FREE,
    nullable: false,
    name: 'plan'
  })
  plan: PlanType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  domain: string;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, any>;

  @Column({ type: 'integer', name: 'max_tours', default: 5 })
  maxTours: number;

  @Column({ type: 'integer', name: 'max_users', default: 100 })
  maxUsers: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  
  @OneToMany(() => User, (user) => user.organization)
  users: User[];
}
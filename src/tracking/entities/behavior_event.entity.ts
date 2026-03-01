import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Organization } from '../../organization/entities/organization.entity';
import { EventType } from '../enums/tracking.enums';

@Entity('behavior_events')
export class BehaviorEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid', nullable: false, name: 'session_id' })
  sessionId: string;

  @Column({ type: 'uuid', nullable: false, name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({
      type: 'enum',              
      enumName: 'event_type',     
      enum: EventType,            
      default: EventType.CLICK,    
      nullable: false,
      name: 'event_type'               
    })
    eventType: EventType;

  @Column({ type: 'varchar', length: 500, nullable: false, name: 'page_url' })
  pageUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'element_selector' })
  elementSelector?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'element_text' })
  elementText?: string;

  @Column({ type: 'int', nullable: true, name: 'scroll_depth' })
  scrollDepth?: number;

  @Column({ type: 'int', nullable: true, name: 'time_on_page' })
  timeOnPage?: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz', name: 'timestamp' })
  timestamp: Date;
}
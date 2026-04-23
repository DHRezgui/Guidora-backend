import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { GuidedTour } from '../../guided-tour/entities/guided-tour.entity';
import { PositionType, ActionType, StepType } from '../enums/tour.enums';

@Entity('steps')
export class Step {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tour_id' })
  tourId: string;

  @ManyToOne(() => GuidedTour, (tour) => tour.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tour_id' })
  tour: GuidedTour;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'target_selector' })
  targetSelector?: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'step_target_url' })
  stepTargetUrl?: string;

  @Column({
    type: 'enum',
    name: 'position',
    enumName: 'position_type',
    enum: PositionType,
    default: PositionType.BOTTOM,
    nullable: false,
  })
  position: PositionType;

  @Column({
    type: 'enum',
    name: 'action',
    enumName: 'action_type',
    enum: ActionType,
    default: ActionType.NEXT,
    nullable: false,
  })
  action: ActionType;

  @Column({ type: 'boolean', default: true, name: 'skip_allowed' })
  skipAllowed: boolean;

  @Column({ type: 'boolean', default: true, name: 'highlight_element' })
  highlightElement: boolean;

  @Column({
    type: 'enum',
    name: 'step_type',
    enumName: 'step_type',
    enum: StepType,
    default: StepType.HIGHLIGHT,
    nullable: false,
  })
  stepType: StepType;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
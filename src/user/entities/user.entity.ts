import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, BeforeInsert, BeforeUpdate } from 'typeorm';
import * as bcrypt from 'bcrypt';

export enum UserRole {
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
  USER = 'USER',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: false, name: 'email' })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: false, name: 'password' })  
  password: string;  

  @Column({ type: 'varchar', length: 100, name: 'first_name', nullable: true })
  firstName: string;

  @Column({ type: 'varchar', length: 100, name: 'last_name', nullable: true })
  lastName: string;

  @Column({
    type: 'enum',              
    enumName: 'user_role',     
    enum: UserRole,            
    default: UserRole.USER,    
    nullable: false,
    name: 'role'               
  })
  role: UserRole;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    // Vérifier si le mot de passe est déjà haché (commence par $2b$ pour bcrypt)
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, 10);
    }
  }

  //  Méthode pour vérifier le mot de passe
  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }

  //  Méthode pour obtenir le nom complet
  get fullName(): string {
    return `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
}
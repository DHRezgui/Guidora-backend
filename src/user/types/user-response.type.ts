import { UserRole } from '../entities/user.entity';

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  organizationId: string | null;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
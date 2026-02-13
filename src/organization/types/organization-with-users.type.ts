import { Organization } from '../entities/organization.entity';
import { User } from '../../user/entities/user.entity';

export interface OrganizationWithUsers {
  id: string;
  name: string;
  apiKey?: string;
  plan: string;
  domain?: string;
  settings?: any;
  maxTours?: number;
  maxUsers?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
  users: Partial<User>[];
}
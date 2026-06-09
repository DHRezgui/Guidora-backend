import type { AdminResourceEditLockInfo } from '../../common/admin-resource-edit-lock.util';
import { PlanType } from '../entities/organization.entity';

export interface OrganizationResponse {
  id: string;
  name: string;
  apiKey: string;
  plan: PlanType;
  domain: string | null;
  settings: Record<string, any>;
  maxTours: number;
  maxUsers: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  editLock?: AdminResourceEditLockInfo;
}
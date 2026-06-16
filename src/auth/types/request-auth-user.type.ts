import { UserRole } from '../../user/entities/user.entity';
import type { SdkTokenScope } from '../sdk-token-scopes';

export type AuthMethod = 'jwt' | 'sdk_token' | 'sdk_session';

export interface RequestAuthUser {
  id: string;
  email?: string;
  role: UserRole | 'SDK_TOKEN';
  organizationId: string;
  authMethod: AuthMethod;
  sdkTokenId?: string;
  sdkSessionTokenId?: string;
  scopes?: SdkTokenScope[];
}

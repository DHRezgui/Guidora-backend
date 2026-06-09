import { SetMetadata } from '@nestjs/common';
import type { SdkTokenScope } from '../sdk-token-scopes';

export const ALLOW_SDK_SCOPES_KEY = 'allow_sdk_scopes';

/**
 * Lets an SDK integration token satisfy `@Roles(ADMIN)` when it carries these scopes.
 * Dashboard JWT users still need the declared role.
 */
export const AllowSdkScopes = (...scopes: SdkTokenScope[]) =>
  SetMetadata(ALLOW_SDK_SCOPES_KEY, scopes);

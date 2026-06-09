import { SetMetadata } from '@nestjs/common';
import type { SdkTokenScope } from '../sdk-token-scopes';

export const REQUIRE_SDK_SCOPES_KEY = 'require_sdk_scopes';

/** Required scopes when the caller authenticates with an SDK integration token (PAT). */
export const RequireSdkScopes = (...scopes: SdkTokenScope[]) =>
  SetMetadata(REQUIRE_SDK_SCOPES_KEY, scopes);

import { SetMetadata } from '@nestjs/common';

export const ALLOW_DASHBOARD_JWT_ON_SDK_ROUTE_KEY = 'allow_dashboard_jwt_on_sdk_route';

/**
 * On routes that also carry `@RequireSdkScopes`, lets dashboard session JWT pass
 * when `@Roles` matches (e.g. blueprint field catalog for admins). SDK PAT still
 * works via the normal scope check. Routes without this decorator reject JWT.
 */
export const AllowDashboardJwtOnSdkRoute = () =>
  SetMetadata(ALLOW_DASHBOARD_JWT_ON_SDK_ROUTE_KEY, true);

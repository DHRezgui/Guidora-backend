import { ConfigService } from '@nestjs/config';

const DEV_FALLBACK_JWT_SECRET = 'dev-only-jwt-secret-change-me';

/**
 * Resolves JWT signing secret. Production refuses to boot without JWT_SECRET.
 * Non-production keeps a local fallback so unit/e2e tests still run.
 */
export function resolveJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET')?.trim();
  if (secret) {
    return secret;
  }

  const nodeEnv = (configService.get<string>('NODE_ENV') || process.env.NODE_ENV || '').trim();
  if (nodeEnv === 'production') {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production');
  }

  return DEV_FALLBACK_JWT_SECRET;
}

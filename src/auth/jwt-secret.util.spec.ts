import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from './jwt-secret.util';

describe('resolveJwtSecret', () => {
  const makeConfig = (values: Record<string, string | undefined>) =>
    ({
      get: (key: string) => values[key],
    }) as ConfigService;

  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  it('returns configured JWT_SECRET when set', () => {
    expect(
      resolveJwtSecret(
        makeConfig({ JWT_SECRET: '  configured-secret-value-min-32  ', NODE_ENV: 'production' }),
      ),
    ).toBe('configured-secret-value-min-32');
  });

  it('throws in production when JWT_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveJwtSecret(makeConfig({ NODE_ENV: 'production' }))).toThrow(
      /JWT_SECRET must be set/,
    );
  });

  it('falls back in non-production when JWT_SECRET is missing', () => {
    process.env.NODE_ENV = 'development';
    expect(resolveJwtSecret(makeConfig({ NODE_ENV: 'development' }))).toContain('dev-only');
  });
});

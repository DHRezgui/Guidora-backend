import { Module, Global, DynamicModule } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export interface RedisModuleOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions): DynamicModule {
    const redisProvider = {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const enabled = process.env.REDIS_ENABLED !== 'false';
        if (!enabled) {
          console.log('[RedisModule] Redis disabled (REDIS_ENABLED=false)');
          return null;
        }
        return new Redis({
          host: options.host,
          port: options.port,
          password: options.password,
          db: options.db ?? 0,
          lazyConnect: false,
          maxRetriesPerRequest: 3,
        });
      },
    };

    return {
      module: RedisModule,
      providers: [redisProvider],
      exports: [redisProvider],
    };
  }
}

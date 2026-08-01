import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { RedisThrottlerStorage } from '../shared/throttling/redis-throttler.storage';

export function createStandaloneThrottleOptions(
  config: ConfigService,
): ThrottlerModuleOptions {
  const redisUrl = config.get<string>('REDIS_URL', '').trim();
  return {
    ...(redisUrl ? { storage: new RedisThrottlerStorage(redisUrl) } : {}),
    throttlers: [
      {
        name: 'default',
        ttl: 60 * 60_000,
        limit: 20,
      },
    ],
  };
}

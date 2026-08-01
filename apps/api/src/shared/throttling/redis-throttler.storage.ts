import { Logger, OnModuleDestroy } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

type RedisClient = Pick<Redis, 'eval' | 'quit' | 'disconnect' | 'on'>;
type ThrottlerRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

const INCREMENT_SCRIPT = `
local countKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local blockedHits = tonumber(redis.call('GET', countKey)) or (limit + 1)
  local countTtl = redis.call('PTTL', countKey)
  if countTtl < 0 then countTtl = ttl end
  return { blockedHits, math.ceil(countTtl / 1000), 1, math.ceil(blockTtl / 1000) }
end

local priorHits = tonumber(redis.call('GET', countKey)) or 0
if priorHits > limit then
  redis.call('DEL', countKey)
end

local hits = redis.call('INCR', countKey)
if hits == 1 then redis.call('PEXPIRE', countKey, ttl) end
local countTtl = redis.call('PTTL', countKey)

if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  return { hits, math.ceil(countTtl / 1000), 1, math.ceil(blockDuration / 1000) }
end

return { hits, math.ceil(countTtl / 1000), 0, 0 }
`;

export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: RedisClient;

  constructor(redisUrl: string, redisClient?: RedisClient) {
    this.redis =
      redisClient ??
      new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    this.redis.on('error', () => {
      // Connection messages can contain hostnames or credential-bearing URLs.
      this.logger.error('Rate-limit Redis is unavailable');
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    const prefix = `applyai:throttle:${throttlerName}:${key}`;
    const result = await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      `${prefix}:count`,
      `${prefix}:block`,
      String(ttl),
      String(limit),
      String(blockDuration),
    );
    if (!Array.isArray(result) || result.length !== 4) {
      throw new Error('Rate-limit Redis returned an invalid response');
    }
    const values = result.map(Number);
    if (values.some((value) => !Number.isFinite(value))) {
      throw new Error('Rate-limit Redis returned an invalid response');
    }
    return {
      totalHits: values[0],
      timeToExpire: Math.max(0, values[1]),
      isBlocked: values[2] === 1,
      timeToBlockExpire: Math.max(0, values[3]),
    };
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

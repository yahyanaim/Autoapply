import {
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CareerChatUsageLimiter } from '../src/modules/career-chat/infrastructure/career-chat-usage-limiter.service';

describe('Career Assistant integration: shared Redis budgets', () => {
  let cleanupRedis: Redis;
  let limiter: CareerChatUsageLimiter;

  beforeAll(async () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('Integration tests require REDIS_URL');
    }
    cleanupRedis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    await cleanupRedis.ping();
  });

  beforeEach(async () => {
    await deleteCurrentBudgetKeys(cleanupRedis);
  });

  afterEach(async () => {
    await limiter?.onModuleDestroy();
  });

  afterAll(async () => {
    await deleteCurrentBudgetKeys(cleanupRedis);
    await cleanupRedis?.quit();
  });

  it('atomically permits only one concurrent request at the shared daily ceiling', async () => {
    limiter = new CareerChatUsageLimiter(
      config({
        REDIS_URL: process.env.REDIS_URL,
        DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS: 1_000,
        DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET: 104,
        DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET: 10_000,
      }),
    );
    const messages = [{ role: 'user' as const, content: 'test' }];

    const outcomes = await Promise.allSettled([
      limiter.reserve(messages, 100),
      limiter.reserve(messages, 100),
    ]);

    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    const rejection = outcomes.find(({ status }) => status === 'rejected') as
      PromiseRejectedResult | undefined;
    expect(rejection?.reason).toBeInstanceOf(ServiceUnavailableException);
  });

  it('enforces the per-request ceiling before reserving shared capacity', async () => {
    limiter = new CareerChatUsageLimiter(
      config({
        REDIS_URL: process.env.REDIS_URL,
        DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS: 100,
        DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET: 10_000,
        DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET: 10_000,
      }),
    );

    await expect(
      limiter.reserve([{ role: 'user', content: 'x'.repeat(404) }], 1),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
  } as unknown as ConfigService;
}

async function deleteCurrentBudgetKeys(redis: Redis): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  await redis.del(
    `applyai:career-chat:budget:day:${day}`,
    `applyai:career-chat:budget:month:${month}`,
  );
}

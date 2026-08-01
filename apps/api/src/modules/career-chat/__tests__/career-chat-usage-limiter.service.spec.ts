import {
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CareerChatUsageLimiter } from '../infrastructure/career-chat-usage-limiter.service';

describe('CareerChatUsageLimiter', () => {
  const values: Record<string, unknown> = {
    REDIS_URL: '',
    DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS: 1_000,
    DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET: 10_000,
    DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET: 100_000,
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
    ),
  } as unknown as ConfigService;

  beforeEach(() => {
    values.DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS = 1_000;
    values.DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET = 10_000;
    values.DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET = 100_000;
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a request whose estimated input and output exceed the request budget', async () => {
    values.DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS = 100;
    const limiter = new CareerChatUsageLimiter(config);

    await expect(
      limiter.reserve([{ role: 'user', content: 'x'.repeat(404) }], 1),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('stops further provider calls when the daily token budget is exhausted', async () => {
    values.DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET = 208;
    const limiter = new CareerChatUsageLimiter(config);
    const messages = [{ role: 'user' as const, content: 'test' }];

    await expect(limiter.reserve(messages, 100)).resolves.toBe(104);
    await expect(limiter.reserve(messages, 100)).resolves.toBe(104);
    await expect(limiter.reserve(messages, 100)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('enforces the monthly token budget even when the daily limit is higher', async () => {
    values.DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET = 1_000;
    values.DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET = 104;
    const limiter = new CareerChatUsageLimiter(config);
    const messages = [{ role: 'user' as const, content: 'test' }];

    await expect(limiter.reserve(messages, 100)).resolves.toBe(104);
    await expect(limiter.reserve(messages, 100)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('starts a fresh in-memory daily budget after UTC midnight', async () => {
    values.DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET = 104;
    const limiter = new CareerChatUsageLimiter(config);
    const messages = [{ role: 'user' as const, content: 'test' }];

    await limiter.reserve(messages, 100);
    jest.setSystemTime(new Date('2026-07-30T00:00:00.001Z'));

    await expect(limiter.reserve(messages, 100)).resolves.toBe(104);
  });

  it('reserves the worst-case cost of every provider attempt', async () => {
    const limiter = new CareerChatUsageLimiter(config);
    const messages = [{ role: 'user' as const, content: 'test' }];

    await expect(limiter.reserve(messages, 100, 3)).resolves.toBe(312);
  });

  it('uses a conservative UTF-8 estimate for Arabic text', async () => {
    values.DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS = 10;
    const limiter = new CareerChatUsageLimiter(config);

    await expect(
      limiter.reserve([{ role: 'user', content: 'مرحبا' }], 1),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});

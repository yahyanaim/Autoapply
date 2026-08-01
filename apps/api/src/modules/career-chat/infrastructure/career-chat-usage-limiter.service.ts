import {
  Injectable,
  OnModuleDestroy,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CareerChatMessage } from '../domain/career-chat-provider.interface';

type RedisBudgetClient = Pick<Redis, 'eval' | 'quit' | 'disconnect' | 'on'>;

interface MemoryBudget {
  tokens: number;
  expiresAt: number;
}

const RESERVE_BUDGET_SCRIPT = `
local dayKey = KEYS[1]
local monthKey = KEYS[2]
local requested = tonumber(ARGV[1])
local dayLimit = tonumber(ARGV[2])
local monthLimit = tonumber(ARGV[3])
local dayTtl = tonumber(ARGV[4])
local monthTtl = tonumber(ARGV[5])

local dayUsed = tonumber(redis.call('GET', dayKey)) or 0
local monthUsed = tonumber(redis.call('GET', monthKey)) or 0

if dayUsed + requested > dayLimit or monthUsed + requested > monthLimit then
  return { 0, dayUsed, monthUsed }
end

local nextDayUsed = redis.call('INCRBY', dayKey, requested)
if nextDayUsed == requested then redis.call('PEXPIRE', dayKey, dayTtl) end

local nextMonthUsed = redis.call('INCRBY', monthKey, requested)
if nextMonthUsed == requested then redis.call('PEXPIRE', monthKey, monthTtl) end

return { 1, nextDayUsed, nextMonthUsed }
`;

/**
 * Conservatively reserves an estimated number of provider tokens before a
 * request leaves ApplyAI. Failed requests are not refunded, so provider usage
 * can never exceed the configured local budget because of optimistic
 * accounting.
 */
@Injectable()
export class CareerChatUsageLimiter implements OnModuleDestroy {
  private readonly redis?: RedisBudgetClient;
  private readonly memoryBudgets = new Map<string, MemoryBudget>();

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL', '').trim();
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      this.redis.on('error', () => {
        // Intentionally omit connection details; Redis URLs may contain credentials.
      });
    }
  }

  async reserve(
    messages: CareerChatMessage[],
    maxOutputTokens: number,
    maximumAttempts = 1,
  ): Promise<number> {
    // UTF-8 bytes are a deliberately conservative tokenizer-independent upper
    // bound, including for Arabic and mixed-script conversations.
    const estimatedInputTokens = messages.reduce(
      (total, message) => total + Buffer.byteLength(message.content, 'utf8'),
      0,
    );
    const perAttemptTokens =
      Math.max(1, estimatedInputTokens) + maxOutputTokens;
    const requestedTokens =
      perAttemptTokens * Math.max(1, Math.floor(maximumAttempts));
    const maxRequestTokens = this.config.get<number>(
      'DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS',
      3_500,
    );

    if (perAttemptTokens > maxRequestTokens) {
      throw new PayloadTooLargeException(
        'The conversation is too long. Start a new chat and try again.',
      );
    }

    const dailyLimit = this.config.get<number>(
      'DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET',
      250_000,
    );
    const monthlyLimit = this.config.get<number>(
      'DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET',
      5_000_000,
    );
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const monthKey = dayKey.slice(0, 7);
    const accepted = this.redis
      ? await this.reserveInRedis(
          requestedTokens,
          dailyLimit,
          monthlyLimit,
          dayKey,
          monthKey,
          now,
        )
      : this.reserveInMemory(
          requestedTokens,
          dailyLimit,
          monthlyLimit,
          dayKey,
          monthKey,
          now,
        );

    if (!accepted) {
      throw new ServiceUnavailableException(
        'The Career Assistant has reached its temporary usage limit. Please try again later.',
      );
    }

    return requestedTokens;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private async reserveInRedis(
    requestedTokens: number,
    dailyLimit: number,
    monthlyLimit: number,
    dayKey: string,
    monthKey: string,
    now: Date,
  ): Promise<boolean> {
    const dayTtl = this.millisecondsUntilNextUtcDay(now);
    const monthTtl = this.millisecondsUntilNextUtcMonth(now);

    let result: unknown;
    try {
      result = await this.redis!.eval(
        RESERVE_BUDGET_SCRIPT,
        2,
        `applyai:career-chat:budget:day:${dayKey}`,
        `applyai:career-chat:budget:month:${monthKey}`,
        String(requestedTokens),
        String(dailyLimit),
        String(monthlyLimit),
        String(dayTtl),
        String(monthTtl),
      );
    } catch {
      // A configured shared limiter fails closed; it must never silently become
      // an unshared per-instance allowance during an outage.
      throw new ServiceUnavailableException(
        'The Career Assistant is temporarily unavailable. Please try again later.',
      );
    }

    if (
      !Array.isArray(result) ||
      result.length !== 3 ||
      ![0, 1].includes(Number(result[0]))
    ) {
      throw new ServiceUnavailableException(
        'The Career Assistant is temporarily unavailable. Please try again later.',
      );
    }
    return Number(result[0]) === 1;
  }

  private reserveInMemory(
    requestedTokens: number,
    dailyLimit: number,
    monthlyLimit: number,
    dayKey: string,
    monthKey: string,
    now: Date,
  ): boolean {
    const nowMs = now.getTime();
    const day = this.currentMemoryBudget(
      `day:${dayKey}`,
      nowMs + this.millisecondsUntilNextUtcDay(now),
      nowMs,
    );
    const month = this.currentMemoryBudget(
      `month:${monthKey}`,
      nowMs + this.millisecondsUntilNextUtcMonth(now),
      nowMs,
    );

    if (day.tokens + requestedTokens > dailyLimit) return false;
    if (month.tokens + requestedTokens > monthlyLimit) return false;
    day.tokens += requestedTokens;
    month.tokens += requestedTokens;
    return true;
  }

  private currentMemoryBudget(
    key: string,
    expiresAt: number,
    now: number,
  ): MemoryBudget {
    const existing = this.memoryBudgets.get(key);
    if (existing && existing.expiresAt > now) return existing;
    const created = { tokens: 0, expiresAt };
    this.memoryBudgets.set(key, created);
    return created;
  }

  private millisecondsUntilNextUtcDay(now: Date): number {
    return (
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) -
      now.getTime()
    );
  }

  private millisecondsUntilNextUtcMonth(now: Date): number {
    return (
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - now.getTime()
    );
  }
}

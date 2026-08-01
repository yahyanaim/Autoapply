import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { loadRootModule } from '../../root-module.loader';
import {
  CAREER_CHAT_CONTEXT,
  CareerChatContextProvider,
} from '../../modules/career-chat/domain/career-chat-context.interface';
import { CareerChatHealthService } from '../../modules/career-chat/infrastructure/career-chat-health.service';
import { CareerChatController } from '../../modules/career-chat/interface/career-chat.controller';
import { RedisThrottlerStorage } from '../../shared/throttling/redis-throttler.storage';
import { StandaloneHealthController } from '../standalone-health.controller';
import { createStandaloneThrottleOptions } from '../standalone-throttle.options';
import { StaticCareerChatContextService } from '../static-career-chat-context.service';

describe('standalone career chat runtime', () => {
  const originalStandalone = process.env.CAREER_CHAT_STANDALONE;
  const originalEnabled = process.env.CAREER_CHAT_ENABLED;
  const originalApiKey = process.env.DAHL_CAREER_CHAT_API_KEY;

  afterAll(() => {
    restoreEnvironment('CAREER_CHAT_STANDALONE', originalStandalone);
    restoreEnvironment('CAREER_CHAT_ENABLED', originalEnabled);
    restoreEnvironment('DAHL_CAREER_CHAT_API_KEY', originalApiKey);
  });

  it('loads the minimal module without importing the full application module', async () => {
    process.env.CAREER_CHAT_STANDALONE = 'true';
    process.env.CAREER_CHAT_ENABLED = 'true';
    process.env.DAHL_CAREER_CHAT_API_KEY = 'test-key-not-a-secret';

    const rootModule = await loadRootModule();

    expect(rootModule.name).toBe('CareerChatStandaloneModule');

    const testingModule = await Test.createTestingModule({
      imports: [rootModule],
    }).compile();
    expect(
      testingModule.get<CareerChatContextProvider>(CAREER_CHAT_CONTEXT),
    ).toBeInstanceOf(StaticCareerChatContextService);
    await testingModule.close();
  });

  it('builds context without a database and only allows official sources', async () => {
    const context = await new StaticCareerChatContextService().build();

    expect(context.text).toContain('Current job listings are not connected');
    expect(context.allowedSources).toEqual([
      'https://www.anapec.org/',
      'https://www.emploi-public.ma/',
      'https://www.travail.gov.ma/',
    ]);
  });

  it('reports ready only after the non-content provider health probe succeeds', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          CAREER_CHAT_ENABLED: true,
          DAHL_CAREER_CHAT_API_KEY: 'configured',
        };
        return key in values ? values[key] : fallback;
      }),
    } as unknown as ConfigService;
    const providerHealth = {
      check: jest.fn().mockResolvedValue(undefined),
    } as unknown as CareerChatHealthService;

    const health = new StandaloneHealthController(config, providerHealth);

    expect(health.liveness()).toEqual({
      status: 'ok',
      mode: 'career-chat-standalone',
    });
    await expect(health.readiness()).resolves.toEqual({
      status: 'ready',
      mode: 'career-chat-standalone',
    });
    expect(providerHealth.check).toHaveBeenCalledTimes(1);
  });

  it('uses shared Redis throttling when REDIS_URL is configured', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'REDIS_URL' ? 'redis://localhost:6379' : fallback,
      ),
    } as unknown as ConfigService;

    const options = createStandaloneThrottleOptions(config) as {
      storage?: unknown;
      throttlers: unknown[];
    };

    expect(options.storage).toBeInstanceOf(RedisThrottlerStorage);
    expect(options.throttlers).toEqual([
      {
        name: 'default',
        ttl: 60 * 60_000,
        limit: 20,
      },
    ]);
    await (options.storage as RedisThrottlerStorage).onModuleDestroy();
  });

  it('preserves in-memory throttling for a standalone server without Redis', () => {
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;

    const options = createStandaloneThrottleOptions(config) as {
      storage?: unknown;
      throttlers: unknown[];
    };

    expect(options.storage).toBeUndefined();
    expect(options.throttlers).toHaveLength(1);
  });

  it('enforces HTTP 429 after twenty calls to the messages endpoint', async () => {
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;
    const storage = new ThrottlerStorageService();
    const guard = new ThrottlerGuard(
      createStandaloneThrottleOptions(config),
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
    const response = { header: jest.fn() };
    const request = { ip: '127.0.0.1', headers: {} };
    const context = {
      getHandler: () => CareerChatController.prototype.answer,
      getClass: () => CareerChatController,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    for (let index = 0; index < 20; index += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
    const rejected = guard.canActivate(context);
    await expect(rejected).rejects.toBeInstanceOf(ThrottlerException);
    await expect(rejected).rejects.toMatchObject({ status: 429 });
    expect(response.header).toHaveBeenCalledWith(
      'Retry-After',
      expect.any(Number),
    );
    storage.onApplicationShutdown();
  });
});

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

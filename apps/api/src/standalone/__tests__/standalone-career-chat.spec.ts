import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { loadRootModule } from '../../root-module.loader';
import {
  CAREER_CHAT_CONTEXT,
  CareerChatContextProvider,
} from '../../modules/career-chat/domain/career-chat-context.interface';
import { StandaloneHealthController } from '../standalone-health.controller';
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
    expect(testingModule.get<CareerChatContextProvider>(CAREER_CHAT_CONTEXT)).toBeInstanceOf(
      StaticCareerChatContextService,
    );
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

  it('reports ready using only the dedicated chatbot configuration', () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          CAREER_CHAT_ENABLED: true,
          DAHL_CAREER_CHAT_API_KEY: 'configured',
        };
        return key in values ? values[key] : fallback;
      }),
    } as unknown as ConfigService;

    const health = new StandaloneHealthController(config);

    expect(health.liveness()).toEqual({
      status: 'ok',
      mode: 'career-chat-standalone',
    });
    expect(health.readiness()).toEqual({
      status: 'ready',
      mode: 'career-chat-standalone',
    });
  });
});

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

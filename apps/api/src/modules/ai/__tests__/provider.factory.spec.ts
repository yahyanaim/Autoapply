import { ServiceUnavailableException } from '@nestjs/common';
import { AIProviderFactory } from '../infrastructure/providers/provider.factory';

describe('AIProviderFactory resilience', () => {
  const prompt = {
    id: 'test.v1',
    version: 'v1',
    systemPrompt: 'System',
    userPrompt: 'Hello {{name}}',
  };
  const response = {
    content: 'ok',
    model: 'test-model',
    tokensUsed: { input: 1, output: 1 },
  };

  function factory(
    openai: { complete: jest.Mock },
    claude: { complete: jest.Mock },
    overrides: Record<string, unknown> = {},
  ) {
    const values: Record<string, unknown> = {
      AI_PROVIDER: 'openai',
      AI_FALLBACK_PROVIDERS: 'claude',
      AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD: 2,
      AI_CIRCUIT_BREAKER_RESET_MS: 60_000,
      ...overrides,
    };
    const config = {
      get: jest.fn((key: string, fallback: unknown) => values[key] ?? fallback),
    };
    return new AIProviderFactory(
      config as never,
      openai as never,
      claude as never,
      { complete: jest.fn() } as never,
      {
        getRequestId: jest.fn().mockReturnValue('request-test'),
        getUserId: jest.fn().mockReturnValue('user-test'),
      } as never,
    );
  }

  it('uses the configured primary provider when healthy', async () => {
    const openai = { complete: jest.fn().mockResolvedValue(response) };
    const claude = { complete: jest.fn() };

    await expect(
      factory(openai, claude).completeWithFallback(prompt, { name: 'Ada' }),
    ).resolves.toEqual({ response, providerName: 'openai' });
    expect(claude.complete).not.toHaveBeenCalled();
  });

  it('fails over to the next configured provider', async () => {
    const openai = { complete: jest.fn().mockRejectedValue(new Error('outage')) };
    const claude = { complete: jest.fn().mockResolvedValue(response) };

    await expect(
      factory(openai, claude).completeWithFallback(prompt, {}),
    ).resolves.toEqual({ response, providerName: 'claude' });
  });

  it('opens a failed provider circuit and skips it until recovery', async () => {
    const openai = { complete: jest.fn().mockRejectedValue(new Error('outage')) };
    const claude = { complete: jest.fn().mockResolvedValue(response) };
    const resilientFactory = factory(openai, claude);

    await resilientFactory.completeWithFallback(prompt, {});
    await resilientFactory.completeWithFallback(prompt, {});
    await resilientFactory.completeWithFallback(prompt, {});

    expect(openai.complete).toHaveBeenCalledTimes(2);
    expect(claude.complete).toHaveBeenCalledTimes(3);
  });

  it('returns a controlled error when every provider is unavailable', async () => {
    const openai = { complete: jest.fn().mockRejectedValue(new Error('outage')) };
    const claude = { complete: jest.fn().mockRejectedValue(new Error('outage')) };

    await expect(
      factory(openai, claude).completeWithFallback(prompt, {}),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

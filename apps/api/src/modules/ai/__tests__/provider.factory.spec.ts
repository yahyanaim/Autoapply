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

  it('caps paid fallback attempts before another provider can be charged', async () => {
    const openai = { complete: jest.fn().mockRejectedValue(new Error('outage')) };
    const claude = { complete: jest.fn().mockResolvedValue(response) };

    await expect(
      factory(openai, claude, {
        AI_FALLBACK_PROVIDERS: 'claude,gemini',
        AI_MAX_PROVIDER_ATTEMPTS: 1,
      }).completeWithFallback(prompt, {}),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(openai.complete).toHaveBeenCalledTimes(1);
    expect(claude.complete).not.toHaveBeenCalled();
  });

  it('does not call a paid provider when its bounded request estimate exceeds the total budget', async () => {
    const openai = { complete: jest.fn().mockResolvedValue(response) };
    const claude = { complete: jest.fn().mockResolvedValue(response) };

    await expect(
      factory(openai, claude, {
        AI_MAX_FALLBACK_TOTAL_COST_USD: 0.01,
        AI_OUTPUT_COST_PER_MILLION: 1_000,
        AI_MAX_OUTPUT_TOKENS: 2_048,
      }).completeWithFallback(prompt, {}),
    ).rejects.toThrow('AI provider execution budget is unavailable');

    expect(openai.complete).not.toHaveBeenCalled();
    expect(claude.complete).not.toHaveBeenCalled();
  });

  it('never lets a fallback setting raise the paid per-request cost cap', () => {
    const resilientFactory = factory(
      { complete: jest.fn() },
      { complete: jest.fn() },
      {
        AI_MAX_REQUEST_COST_USD: 0.2,
        AI_MAX_FALLBACK_TOTAL_COST_USD: 0.8,
      },
    );

    expect(resilientFactory.getMaxFallbackCost()).toBe(0.2);
  });

  it('passes provider-specific output bounds through each paid attempt', async () => {
    const openai = { complete: jest.fn().mockResolvedValue(response) };
    const claude = { complete: jest.fn() };

    await factory(openai, claude, {
      OPENAI_MAX_OUTPUT_TOKENS: 512,
    }).completeWithFallback(prompt, {});

    expect(openai.complete).toHaveBeenCalledWith(
      prompt,
      {},
      expect.objectContaining({ maxOutputTokens: 512 }),
    );
  });

  it('uses canonical ANTHROPIC settings for Claude provider bounds and costs', async () => {
    const openai = { complete: jest.fn() };
    const claude = { complete: jest.fn().mockResolvedValue(response) };
    const resilientFactory = factory(openai, claude, {
      AI_PROVIDER: 'claude',
      AI_FALLBACK_PROVIDERS: '',
      ANTHROPIC_MAX_OUTPUT_TOKENS: 512,
      ANTHROPIC_INPUT_COST_PER_MILLION: 7,
      ANTHROPIC_OUTPUT_COST_PER_MILLION: 11,
      CLAUDE_MAX_OUTPUT_TOKENS: 256,
      CLAUDE_INPUT_COST_PER_MILLION: 3,
      CLAUDE_OUTPUT_COST_PER_MILLION: 5,
    });

    await resilientFactory.completeWithFallback(prompt, {});

    expect(claude.complete).toHaveBeenCalledWith(
      prompt,
      {},
      expect.objectContaining({ maxOutputTokens: 512 }),
    );
    expect(resilientFactory.getInputCostPerMillionForProvider('claude')).toBe(7);
    expect(resilientFactory.getOutputCostPerMillionForProvider('claude')).toBe(11);
  });

  it('uses legacy CLAUDE settings only when canonical Anthropic settings are absent', () => {
    const resilientFactory = factory(
      { complete: jest.fn() },
      { complete: jest.fn() },
      {
        CLAUDE_MAX_OUTPUT_TOKENS: 512,
        CLAUDE_INPUT_COST_PER_MILLION: 7,
        CLAUDE_OUTPUT_COST_PER_MILLION: 11,
      },
    );

    expect(resilientFactory.getMaxOutputTokensForProvider('claude')).toBe(512);
    expect(resilientFactory.getInputCostPerMillionForProvider('claude')).toBe(7);
    expect(resilientFactory.getOutputCostPerMillionForProvider('claude')).toBe(11);
  });

  it('falls back safely when an optional provider override is blank', () => {
    const resilientFactory = factory(
      { complete: jest.fn() },
      { complete: jest.fn() },
      {
        AI_MAX_OUTPUT_TOKENS: 2_048,
        OPENAI_MAX_OUTPUT_TOKENS: '',
        AI_INPUT_COST_PER_MILLION: 3,
        OPENAI_INPUT_COST_PER_MILLION: '',
      },
    );

    expect(resilientFactory.getMaxOutputTokensForProvider('openai')).toBe(2_048);
    expect(resilientFactory.getInputCostPerMillionForProvider('openai')).toBe(3);
  });
});

import { AIRequestFeature, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { AIService } from '../application/ai.service';
import { PlanAwareAiRouter } from '../application/plan-aware-ai.router';
import { AIProviderFactory } from '../infrastructure/providers/provider.factory';
import { OpenAIProvider } from '../infrastructure/providers/openai.provider';
import { ClaudeProvider } from '../infrastructure/providers/claude.provider';
import { GeminiProvider } from '../infrastructure/providers/gemini.provider';
import { GlmProvider } from '../infrastructure/providers/glm.provider';

/** These tests execute the real service, router, and paid fallback path. */
describe('AI physical provider cost capture', () => {
  const response = { content: '{}', model: 'synthetic', tokensUsed: { input: 2, output: 3 }, usageReported: true };

  function setup(plan: SubscriptionPlan, settings: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = {
      AI_PROVIDER: 'openai', AI_FALLBACK_PROVIDERS: 'claude',
      AI_INPUT_COST_PER_MILLION: 2, AI_OUTPUT_COST_PER_MILLION: 3,
      AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD: 1,
      OPENAI_API_KEY: 'synthetic-key', ANTHROPIC_API_KEY: 'synthetic-key',
      GOOGLE_AI_API_KEY: 'synthetic-key', GLM_FREE_PLAN_API_KEY: 'synthetic-key',
      GLM_FREE_PLAN_BASE_URL: 'https://glm.example.test/v1', GLM_FREE_PLAN_MODEL: 'glm-test',
      ...settings,
    };
    const config = { get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback) };
    const openaiReadiness = new OpenAIProvider(config as never);
    const claudeReadiness = new ClaudeProvider(config as never);
    const geminiReadiness = new GeminiProvider(config as never);
    const glmReadiness = new GlmProvider(config as never);
    const openai = { assertReadyForDispatch: jest.fn(() => openaiReadiness.assertReadyForDispatch()),
      complete: jest.fn().mockResolvedValue(response) };
    const claude = { assertReadyForDispatch: jest.fn(() => claudeReadiness.assertReadyForDispatch()),
      complete: jest.fn().mockResolvedValue(response) };
    const gemini = { assertReadyForDispatch: jest.fn(() => geminiReadiness.assertReadyForDispatch()),
      complete: jest.fn().mockResolvedValue(response) };
    const glm = { assertReadyForDispatch: jest.fn(() => glmReadiness.assertReadyForDispatch()),
      complete: jest.fn().mockResolvedValue(response) };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'synthetic-user' }) },
      subscription: { findUnique: jest.fn().mockResolvedValue({ plan, status: SubscriptionStatus.active }) },
      aIRequest: { create: jest.fn().mockResolvedValue({ id: 'synthetic-request' }) },
    };
    const factory = new AIProviderFactory(config as never, openai as never, claude as never,
      gemini as never, { getRequestId: () => 'synthetic-request' } as never);
    const router = new PlanAwareAiRouter(prisma as never, glm as never, factory, config as never);
    let next = 0;
    const intentStates = new Map<string, 'pending' | 'costed' | 'uncosted'>();
    const ledger = {
      beginAttempt: jest.fn(async () => {
        const id = `opaque-${++next}`;
        intentStates.set(id, 'pending');
        return id;
      }),
      estimateMicroUsd: jest.fn((input: number, output: number, inputRate: number, outputRate: number) =>
        BigInt(input * inputRate + output * outputRate)),
      finalizeAttempt: jest.fn(async (outcome: { intentId: string; estimatedMicroUsd: bigint | null }) => {
        intentStates.set(outcome.intentId, outcome.estimatedMicroUsd === null ? 'uncosted' : 'costed');
      }),
    };
    const quota = { reserve: jest.fn().mockResolvedValue({ resetAt: new Date('2026-11-01T00:00:00Z') }),
      release: jest.fn().mockResolvedValue(undefined) };
    const service = new AIService(prisma as never, factory, router,
      { loadTemplate: () => 'System\n## Resume\n{{resume}}' } as never,
      {} as never, quota as never, ledger as never);
    const complete = () => service.complete(AIRequestFeature.resume_parse,
      'synthetic-user', { resume: 'synthetic' });
    return { complete, openai, claude, gemini, glm, ledger, intentStates, quota, prisma };
  }

  it('requires durable capture before a dispatched paid call and finalizes its estimate', async () => {
    const unit = setup(SubscriptionPlan.pro);
    await expect(unit.complete()).resolves.toEqual({ content: '{}', model: 'synthetic' });
    expect(unit.openai.complete).toHaveBeenCalledTimes(1);
    expect(unit.ledger.beginAttempt).toHaveBeenCalledTimes(1);
    expect(unit.ledger.finalizeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      intentId: 'opaque-1', estimatedMicroUsd: 13n,
    }));
    expect([...unit.intentStates.values()]).toEqual(['costed']);
    expect(unit.claude.complete).not.toHaveBeenCalled();
  });

  it.each([
    ['API key', { GLM_FREE_PLAN_API_KEY: '' }],
    ['base URL', { GLM_FREE_PLAN_BASE_URL: '' }],
    ['model', { GLM_FREE_PLAN_MODEL: '' }],
    ['unsafe endpoint', { GLM_FREE_PLAN_BASE_URL: 'http://127.0.0.1:3000' }],
  ])('rejects missing or invalid GLM %s before any intent or dispatch', async (_label, settings) => {
    const unit = setup(SubscriptionPlan.free, settings);
    await expect(unit.complete()).rejects.toThrow('The Free AI service is temporarily unavailable');
    expect(unit.glm.complete).not.toHaveBeenCalled();
    expect(unit.openai.complete).not.toHaveBeenCalled();
    expect(unit.claude.complete).not.toHaveBeenCalled();
    expect(unit.ledger.beginAttempt).not.toHaveBeenCalled();
    expect(unit.intentStates.size).toBe(0);
    expect(unit.quota.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['openai', 'OPENAI_API_KEY'],
    ['claude', 'ANTHROPIC_API_KEY'],
    ['gemini', 'GOOGLE_AI_API_KEY'],
    ['openai', 'OPENAI_MODEL'],
    ['claude', 'ANTHROPIC_MODEL'],
    ['gemini', 'GOOGLE_AI_MODEL'],
  ])('rejects unconfigured %s before any intent or dispatch', async (providerName, setting) => {
    const unit = setup(SubscriptionPlan.pro, {
      AI_PROVIDER: providerName, AI_FALLBACK_PROVIDERS: '', [setting]: '',
    });
    await expect(unit.complete()).rejects.toThrow('AI providers are temporarily unavailable');
    expect(unit[providerName as 'openai' | 'claude' | 'gemini'].complete).not.toHaveBeenCalled();
    expect(unit.ledger.beginAttempt).not.toHaveBeenCalled();
    expect(unit.intentStates.size).toBe(0);
    expect(unit.quota.release).toHaveBeenCalledTimes(1);
  });

  it('skips an unconfigured paid provider and captures only the dispatched fallback', async () => {
    const unit = setup(SubscriptionPlan.pro, { OPENAI_API_KEY: '' });
    await expect(unit.complete()).resolves.toEqual({ content: '{}', model: 'synthetic' });
    expect(unit.openai.complete).not.toHaveBeenCalled();
    expect(unit.claude.complete).toHaveBeenCalledTimes(1);
    expect(unit.ledger.beginAttempt).toHaveBeenCalledTimes(1);
    expect([...unit.intentStates.values()]).toEqual(['costed']);
  });

  it('creates no intents when every paid provider is unconfigured', async () => {
    const unit = setup(SubscriptionPlan.pro, {
      AI_FALLBACK_PROVIDERS: 'claude,gemini', OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '', GOOGLE_AI_API_KEY: '',
    });
    await expect(unit.complete()).rejects.toThrow('AI providers are temporarily unavailable');
    expect(unit.openai.complete).not.toHaveBeenCalled();
    expect(unit.claude.complete).not.toHaveBeenCalled();
    expect(unit.gemini.complete).not.toHaveBeenCalled();
    expect(unit.ledger.beginAttempt).not.toHaveBeenCalled();
    expect(unit.intentStates.size).toBe(0);
  });

  it('fails closed before dispatch if durable capture is unavailable', async () => {
    const unit = setup(SubscriptionPlan.pro);
    unit.ledger.beginAttempt.mockRejectedValueOnce(new Error('synthetic persistence failure'));
    await expect(unit.complete()).rejects.toThrow('AI cost capture is unavailable');
    expect(unit.openai.complete).not.toHaveBeenCalled();
    expect(unit.claude.complete).not.toHaveBeenCalled();
    expect(unit.quota.release).toHaveBeenCalledTimes(1);
    await expect(unit.complete()).resolves.toEqual({ content: '{}', model: 'synthetic' });
    expect(unit.openai.complete).toHaveBeenCalledTimes(1);
    expect(unit.claude.complete).not.toHaveBeenCalled();
  });

  it('does not invoke a fallback or poison the circuit if outcome recording fails', async () => {
    const unit = setup(SubscriptionPlan.pro);
    unit.ledger.finalizeAttempt.mockRejectedValueOnce(new Error('synthetic persistence failure'));
    await expect(unit.complete()).rejects.toThrow('AI cost capture is unavailable');
    expect(unit.openai.complete).toHaveBeenCalledTimes(1);
    expect(unit.claude.complete).not.toHaveBeenCalled();
    await expect(unit.complete()).resolves.toEqual({ content: '{}', model: 'synthetic' });
    expect(unit.openai.complete).toHaveBeenCalledTimes(2);
  });

  it.each(['failure', 'timeout'])('leaves a %s attempt unresolved without inventing zero cost', async (kind) => {
    const unit = setup(SubscriptionPlan.pro, { AI_FALLBACK_PROVIDERS: '' });
    unit.openai.complete.mockRejectedValueOnce(new Error(`synthetic ${kind}`));
    await expect(unit.complete()).rejects.toThrow('AI providers are temporarily unavailable');
    expect(unit.ledger.beginAttempt).toHaveBeenCalledTimes(1);
    expect(unit.ledger.finalizeAttempt).not.toHaveBeenCalled();
    expect([...unit.intentStates.values()]).toEqual(['pending']);
    expect(unit.quota.release).toHaveBeenCalledTimes(1);
  });

  it('records distinct durable intents for a failed primary and successful paid fallback', async () => {
    const unit = setup(SubscriptionPlan.pro);
    unit.openai.complete.mockRejectedValueOnce(new Error('synthetic outage'));
    await unit.complete();
    expect(unit.openai.complete).toHaveBeenCalledTimes(1);
    expect(unit.claude.complete).toHaveBeenCalledTimes(1);
    expect(unit.ledger.beginAttempt).toHaveBeenCalledTimes(2);
    expect(unit.ledger.finalizeAttempt).toHaveBeenCalledTimes(1);
    expect([...unit.intentStates.values()]).toEqual(['pending', 'costed']);
    expect(unit.ledger.finalizeAttempt).toHaveBeenCalledWith(expect.objectContaining({ intentId: 'opaque-2' }));
  });

  it('keeps Free GLM cost unresolved without an authoritative provider price and never enters paid fallback', async () => {
    const unit = setup(SubscriptionPlan.free);
    await unit.complete();
    expect(unit.glm.complete).toHaveBeenCalledTimes(1);
    expect(unit.openai.complete).not.toHaveBeenCalled();
    expect(unit.claude.complete).not.toHaveBeenCalled();
    expect(unit.ledger.finalizeAttempt).toHaveBeenCalledWith(expect.objectContaining({ estimatedMicroUsd: null }));
    unit.glm.complete.mockRejectedValueOnce(new Error('synthetic GLM timeout'));
    await expect(unit.complete()).rejects.toThrow('synthetic GLM timeout');
    expect(unit.ledger.beginAttempt).toHaveBeenCalledTimes(2);
    expect(unit.ledger.finalizeAttempt).toHaveBeenCalledTimes(1);
    expect(unit.openai.complete).not.toHaveBeenCalled();
  });

  it('marks successful paid calls with unknown prices uncosted, not zero', async () => {
    const unit = setup(SubscriptionPlan.pro, { AI_INPUT_COST_PER_MILLION: 0, AI_OUTPUT_COST_PER_MILLION: 0 });
    await unit.complete();
    expect(unit.ledger.finalizeAttempt).toHaveBeenCalledWith(expect.objectContaining({ estimatedMicroUsd: null }));
  });

  it('records an evidenced zero only with explicit provider usage and known paid rates', async () => {
    const unit = setup(SubscriptionPlan.pro);
    unit.openai.complete.mockResolvedValueOnce({ ...response, tokensUsed: { input: 0, output: 0 } });
    await unit.complete();
    expect(unit.ledger.finalizeAttempt).toHaveBeenCalledWith(expect.objectContaining({ estimatedMicroUsd: 0n }));
  });

  it('does not mistake omitted provider usage for evidenced zero', async () => {
    const unit = setup(SubscriptionPlan.pro);
    unit.openai.complete.mockResolvedValueOnce({ ...response, tokensUsed: { input: 0, output: 0 }, usageReported: false });
    await unit.complete();
    expect(unit.ledger.finalizeAttempt).toHaveBeenCalledWith(expect.objectContaining({ estimatedMicroUsd: null }));
  });

  it('does not create an intent for a circuit-open provider before falling back', async () => {
    const unit = setup(SubscriptionPlan.pro);
    unit.openai.complete.mockRejectedValueOnce(new Error('synthetic outage'));
    await unit.complete();
    await unit.complete();
    expect(unit.openai.complete).toHaveBeenCalledTimes(1);
    expect(unit.claude.complete).toHaveBeenCalledTimes(2);
    expect(unit.ledger.beginAttempt).toHaveBeenCalledTimes(3);
  });
});

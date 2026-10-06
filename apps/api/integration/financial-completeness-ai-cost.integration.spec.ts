import { AIRequestFeature, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { AiCostLedgerService, AI_COST_BOUNDARY_ID } from '../src/modules/ai/application/ai-cost-ledger.service';
import { BillingFinancialCompletenessService, BILLING_COMBINED_BOUNDARY_ID, MAX_EVIDENCE_ATTEMPTS } from '../src/modules/billing/application/billing-financial-completeness.service';
import { BillingStripeFeeService } from '../src/modules/billing/application/billing-stripe-fee.service';
import { BillingEvidenceRetryService } from '../src/modules/billing/application/billing-evidence-retry.service';
import { BillingService } from '../src/modules/billing/application/billing.service';
import { SubscriptionLifecycleService } from '../src/modules/billing/application/subscription-lifecycle.service';
import { BillingFinancialMetricsRecorderService } from '../src/modules/billing/application/billing-financial-metrics-recorder.service';
import { AIService } from '../src/modules/ai/application/ai.service';
import { AIProviderFactory } from '../src/modules/ai/infrastructure/providers/provider.factory';
import { PlanAwareAiRouter } from '../src/modules/ai/application/plan-aware-ai.router';
import { OpenAIProvider } from '../src/modules/ai/infrastructure/providers/openai.provider';
import { ClaudeProvider } from '../src/modules/ai/infrastructure/providers/claude.provider';
import { GeminiProvider } from '../src/modules/ai/infrastructure/providers/gemini.provider';
import { GlmProvider } from '../src/modules/ai/infrastructure/providers/glm.provider';

const runId = `foundation${process.pid}${Date.now()}`;
const dayMs = 86_400_000;
const utcDay = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

describe('future-only financial completeness and durable AI cost PostgreSQL integration', () => {
  let prisma: PrismaService;
  let ai: AiCostLedgerService;
  let billing: BillingFinancialCompletenessService;
  let feeRecorder: BillingStripeFeeService;
  let effectiveAt: Date;
  const eventIds: string[] = [];
  const attemptIds: string[] = [];
  const additionalFeeDays: Date[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) throw new Error('Isolated test DATABASE_URL required');
    prisma = new PrismaService();
    await prisma.$connect();
    feeRecorder = new BillingStripeFeeService({} as never);
    const [financial, cost] = await Promise.all([
      prisma.billingCombinedMetricsBoundary.findUniqueOrThrow({ where: { id: BILLING_COMBINED_BOUNDARY_ID } }),
      prisma.aiCostMetricsBoundary.findUniqueOrThrow({ where: { id: AI_COST_BOUNDARY_ID } }),
    ]);
    effectiveAt = new Date(Math.max(financial.metricsStartAt.getTime(), cost.metricsStartAt.getTime()) + 20 * dayMs);
    const coverageClock = { now: () => new Date(effectiveAt.getTime() + dayMs) } as never;
    ai = new AiCostLedgerService(prisma, coverageClock);
    billing = new BillingFinancialCompletenessService(prisma, coverageClock);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.billingEvidenceResolution.deleteMany({ where: { case: { sourceStripeEventId: { in: eventIds } } } });
    await prisma.billingFinancialEvidenceCase.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.billingStripeFeeObservation.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.billingStripeFeeEffect.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.stripeWebhookEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.aiCostEvent.deleteMany({ where: { intentId: { in: attemptIds } } });
    await prisma.aiCostIntent.deleteMany({ where: { id: { in: attemptIds } } });
    if (effectiveAt) {
      await prisma.aiDailyCostMetric.deleteMany({ where: { day: utcDay(effectiveAt) } });
      await prisma.billingDailyStripeFeeMetric.deleteMany({ where: { day: utcDay(effectiveAt) } });
    }
    await prisma.billingDailyStripeFeeMetric.deleteMany({ where: { day: { in: additionalFeeDays } } });
    await prisma.user.deleteMany({ where: { email: { in: [
      `${runId}@example.test`, `${runId}success@example.test`, `${runId}config@example.test`,
    ] } } });
    await prisma.$disconnect();
  });

  it('persists one unknown-time case under duplicate ingress, then an evidenced zero without an effect', async () => {
    const id = `evt_${runId}zero`;
    eventIds.push(id);
    const event = { id, type: 'charge.updated',
      data: { object: { id: `ch_${runId}zero`, metadata: { token: 'synthetic-secret' } } } } as never;
    await Promise.all([billing.begin(event), billing.begin(event)]);
    const before = await prisma.billingFinancialEvidenceCase.findMany({ where: { sourceStripeEventId: id } });
    expect(before).toHaveLength(1);
    expect(before[0]?.state).toBe('pending');
    expect(before[0]?.effectiveAt).toBeNull();
    expect(JSON.stringify(before)).not.toContain('synthetic-secret');

    const range = { from: utcDay(effectiveAt), toExclusive: new Date(utcDay(effectiveAt).getTime() + dayMs) };
    expect((await billing.getCoverage(range)).status).toBe('unresolved');
    await prisma.$transaction((tx) => billing.resolveInTransaction(tx, id,
      'stripe_fee', 'resolved_zero', effectiveAt));
    const after = await billing.getCoverage(range);
    expect(after.unresolvedCaseCount).toBe(0);
    expect(after.evidencedZeroCount).toBe(1);
    expect(await prisma.billingEvidenceResolution.count({ where: { caseId: before[0]!.id } })).toBe(1);
    expect(await prisma.billingStripeFeeEffect.count({ where: { sourceStripeEventId: id } })).toBe(0);
  });

  it('rolls back case resolution and history together, then safely retries once', async () => {
    const id = `evt_${runId}rollback`;
    eventIds.push(id);
    await billing.begin({ id, type: 'charge.updated', data: { object: { id: `ch_${runId}rollback` } } } as never);
    await expect(prisma.$transaction(async (tx) => {
      await billing.resolveInTransaction(tx, id, 'stripe_fee', 'resolved_zero', effectiveAt);
      throw new Error('synthetic rollback');
    })).rejects.toThrow('synthetic rollback');
    expect((await prisma.billingFinancialEvidenceCase.findUniqueOrThrow({
      where: { sourceStripeEventId_component: { sourceStripeEventId: id, component: 'stripe_fee' } },
    })).state).toBe('pending');
    expect(await prisma.billingEvidenceResolution.count({ where: { case: { sourceStripeEventId: id } } })).toBe(0);
    await prisma.$transaction((tx) => billing.resolveInTransaction(tx, id,
      'stripe_fee', 'resolved_zero', effectiveAt));
    expect(await prisma.billingEvidenceResolution.count({ where: { case: { sourceStripeEventId: id } } })).toBe(1);
  });

  it('rolls back the case, monetary effect, and daily aggregate together', async () => {
    const id = `evt_${runId}feeatomic`;
    eventIds.push(id);
    await billing.begin({ id, type: 'charge.updated', data: { object: { id: `ch_${runId}feeatomic` } } } as never);
    const prepared = { balanceTransaction: {
      id: `txn_${runId}feeatomic`, currency: 'usd', fee: 17,
      created: Math.floor(effectiveAt.getTime() / 1000),
    }, missingFee: false } as never;
    const record = async (fail: boolean) => prisma.$transaction(async (tx) => {
      await tx.stripeWebhookEvent.create({ data: { eventId: id, type: 'charge.updated' } });
      await feeRecorder.recordInTransaction(tx, id, prepared, new Date());
      await billing.completeInTransaction(tx, id, prepared);
      if (fail) throw new Error('synthetic atomic rollback');
    });
    await expect(record(true)).rejects.toThrow('synthetic atomic rollback');
    expect(await prisma.billingStripeFeeEffect.count({ where: { sourceStripeEventId: id } })).toBe(0);
    expect(await prisma.billingStripeFeeObservation.count({ where: { sourceStripeEventId: id } })).toBe(0);
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: id } })).toBe(0);
    expect(await prisma.billingEvidenceResolution.count({ where: { case: { sourceStripeEventId: id } } })).toBe(0);
    expect((await prisma.billingFinancialEvidenceCase.findUniqueOrThrow({
      where: { sourceStripeEventId_component: { sourceStripeEventId: id, component: 'stripe_fee' } },
    })).state).toBe('pending');
    await record(false);
    expect(await prisma.billingStripeFeeEffect.count({ where: { sourceStripeEventId: id } })).toBe(1);
    expect(await prisma.billingStripeFeeObservation.count({ where: { sourceStripeEventId: id } })).toBe(1);
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: id } })).toBe(1);
    expect(await prisma.billingEvidenceResolution.count({ where: { case: { sourceStripeEventId: id } } })).toBe(1);
    expect((await prisma.billingDailyStripeFeeMetric.findUniqueOrThrow({
      where: { day_currency: { day: utcDay(effectiveAt), currency: 'usd' } },
    })).feeMinor).toBe(17n);
  });

  it('fences expired leases, bounds attempts, and preserves unresolved evidence after exhaustion', async () => {
    const id = `evt_${runId}lease`;
    eventIds.push(id);
    await billing.begin({ id, type: 'charge.updated', data: { object: { id: `ch_${runId}lease` } } } as never);
    const first = (await billing.claimDue()).find((candidate) => candidate.sourceStripeEventId === id)!;
    expect(first.sourceStripeEventId).toBe(id);
    expect(first.fencingToken).toBe(1);
    expect((await billing.claimDue()).find((candidate) => candidate.id === first.id)).toBeUndefined();
    await prisma.billingFinancialEvidenceCase.update({
      where: { id: first.id }, data: { leaseExpiresAt: new Date(0), nextAttemptAt: new Date(0) },
    });
    const second = (await billing.claimDue()).find((candidate) => candidate.id === first.id)!;
    expect(second.fencingToken).toBe(2);
    expect(await prisma.$transaction((tx) => billing.resolveInTransaction(tx, id,
      'stripe_fee', 'resolved_zero', effectiveAt, first.fencingToken))).toBe(false);
    await prisma.billingFinancialEvidenceCase.update({
      where: { id: first.id }, data: { attempts: MAX_EVIDENCE_ATTEMPTS,
        leaseExpiresAt: new Date(0), nextAttemptAt: new Date(0) },
    });
    expect((await billing.claimDue()).find((candidate) => candidate.id === first.id)).toBeUndefined();
    expect((await prisma.billingFinancialEvidenceCase.findUniqueOrThrow({ where: { id: first.id } })).state).toBe('pending');
  });

  it('records one immutable cost under concurrent finalization and survives user deletion', async () => {
    const user = await prisma.user.create({ data: { email: `${runId}@example.test` } });
    const intentId = await ai.beginAttempt();
    attemptIds.push(intentId);
    await prisma.aIRequest.create({ data: {
      userId: user.id, feature: AIRequestFeature.resume_parse, provider: 'synthetic', cost: 0.000001,
    } });
    const input = { intentId, effectiveAt, estimatedMicroUsd: 1n };
    const results = await Promise.allSettled([
      prisma.$transaction((tx) => ai.finalizeInTransaction(tx, input)),
      prisma.$transaction((tx) => ai.finalizeInTransaction(tx, input)),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await prisma.aiCostEvent.count({ where: { intentId } })).toBe(1);
    expect((await prisma.aiDailyCostMetric.findUniqueOrThrow({ where: { day: utcDay(effectiveAt) } })).estimatedMicroUsd).toBe(1n);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.aiCostEvent.count({ where: { intentId } })).toBe(1);
    expect(await prisma.aIRequest.count({ where: { userId: user.id } })).toBe(0);
  });

  it('keeps an unknown cost unresolved, then appends one resolution without changing history', async () => {
    const intentId = await ai.beginAttempt();
    attemptIds.push(intentId);
    await prisma.$transaction((tx) => ai.finalizeInTransaction(tx, {
      intentId, effectiveAt, estimatedMicroUsd: null,
    }));
    const range = { from: utcDay(effectiveAt), toExclusive: new Date(utcDay(effectiveAt).getTime() + dayMs) };
    expect((await ai.getCoverage(range)).status).toBe('unresolved');
    expect(await prisma.aiCostEvent.count({ where: { intentId } })).toBe(0);
    await ai.resolveUncosted(intentId, 3n);
    await ai.resolveUncosted(intentId, 3n);
    expect(await prisma.aiCostEvent.count({ where: { intentId } })).toBe(1);
    const metric = await prisma.aiDailyCostMetric.findUniqueOrThrow({ where: { day: utcDay(effectiveAt) } });
    expect(metric.estimatedMicroUsd).toBe(4n);
    expect(metric.uncostedRequestCount).toBe(0);
  });

  it('converges a webhook and its retry worker on one fee effect and daily increment', async () => {
    const id = `evt_${runId}race`;
    eventIds.push(id);
    const balance = { id: `txn_${runId}race`, fee: 23, currency: 'usd',
      created: Math.floor(effectiveAt.getTime() / 1000) };
    const event = { id, type: 'charge.updated', data: { object: {
      id: `ch_${runId}race`, balance_transaction: balance.id,
    } } } as never;
    const adapter = {
      retrieveEvent: jest.fn().mockResolvedValue(event),
      retrieveBalanceTransaction: jest.fn().mockResolvedValue(balance),
    };
    const fees = new BillingStripeFeeService(adapter as never);
    const command = new BillingService(prisma, adapter as never,
      new SubscriptionLifecycleService(), new BillingFinancialMetricsRecorderService(),
      fees, undefined, billing);
    await billing.begin(event);
    const evidenceCase = await prisma.billingFinancialEvidenceCase.findUniqueOrThrow({
      where: { sourceStripeEventId_component: { sourceStripeEventId: id, component: 'stripe_fee' } },
    });
    await prisma.billingFinancialEvidenceCase.update({ where: { id: evidenceCase.id }, data: {
      fencingToken: 1, leaseExpiresAt: new Date(Date.now() + 60_000),
    } });
    const claimed = { id: evidenceCase.id, sourceStripeEventId: id,
      component: 'stripe_fee' as const, eventType: 'charge.updated',
      providerReference: `ch_${runId}race`, fencingToken: 1, attempts: 1 };
    const retry = new BillingEvidenceRetryService(prisma, adapter as never,
      { claimDue: async () => [claimed], releaseClaim: (...args: [string, number]) => billing.releaseClaim(...args),
        resolveInTransaction: (...args: Parameters<typeof billing.resolveInTransaction>) =>
          billing.resolveInTransaction(...args) } as never,
      fees, { get: () => command } as never);
    const before = await prisma.billingDailyStripeFeeMetric.findUnique({
      where: { day_currency: { day: utcDay(effectiveAt), currency: 'usd' } },
    });
    await Promise.all([command.handleWebhook(event), retry.processDueOnce()]);
    expect(adapter.retrieveEvent).toHaveBeenCalledWith(id);
    expect(await prisma.billingStripeFeeEffect.count({ where: { balanceTransactionId: balance.id } })).toBe(1);
    expect(await prisma.billingStripeFeeObservation.count({ where: { sourceStripeEventId: id } })).toBe(1);
    expect(await prisma.billingEvidenceResolution.count({ where: { caseId: evidenceCase.id } })).toBe(1);
    const after = await prisma.billingDailyStripeFeeMetric.findUniqueOrThrow({
      where: { day_currency: { day: utcDay(effectiveAt), currency: 'usd' } },
    });
    expect(after.feeMinor - (before?.feeMinor ?? 0n)).toBe(23n);
    expect(after.feeEffectCount - (before?.feeEffectCount ?? 0)).toBe(1);
  });

  it('resolves valid timestamps and non-USD evidence but leaves invalid timestamps pending', async () => {
    const original = await prisma.billingCombinedMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_COMBINED_BOUNDARY_ID }, select: { metricsStartAt: true },
    });
    const feeOriginal = await prisma.billingStripeFeeMetricsBoundary.findUniqueOrThrow({
      where: { id: 'stripe_fees_v1' }, select: { metricsStartAt: true },
    });
    const exact = Math.floor(original.metricsStartAt.getTime() / 1000);
    await prisma.billingCombinedMetricsBoundary.update({ where: { id: BILLING_COMBINED_BOUNDARY_ID },
      data: { metricsStartAt: new Date(exact * 1000) } });
    await prisma.billingStripeFeeMetricsBoundary.update({ where: { id: 'stripe_fees_v1' },
      data: { metricsStartAt: new Date(exact * 1000) } });
    try {
      const cases = [
        { label: 'pre', created: exact - 86_400, currency: 'usd', state: 'excluded_pre_boundary' },
        { label: 'exact', created: exact, currency: 'usd', state: 'resolved_effect' },
        { label: 'post', created: exact + 86_400, currency: 'usd', state: 'resolved_effect' },
        { label: 'nonusd', created: exact + 86_400, currency: 'eur', state: 'excluded_non_usd' },
        { label: 'zero', created: 0, currency: 'usd', state: 'pending' },
        { label: 'negative', created: -1, currency: 'usd', state: 'pending' },
        { label: 'nan', created: Number.NaN, currency: 'usd', state: 'pending' },
        { label: 'missing', created: undefined, currency: 'usd', state: 'pending' },
      ] as const;
      for (const item of cases) {
        const id = `evt_${runId}timestamp${item.label}`;
        eventIds.push(id);
        const balance = { id: `txn_${runId}timestamp${item.label}`, fee: 11,
          currency: item.currency, created: item.created };
        const event = { id, type: 'charge.updated', data: { object: {
          id: `ch_${runId}timestamp${item.label}`, balance_transaction: balance.id,
        } } } as never;
        await billing.begin(event);
        await prisma.stripeWebhookEvent.create({ data: { eventId: id, type: 'charge.updated' } });
        const evidenceCase = await prisma.billingFinancialEvidenceCase.findUniqueOrThrow({
          where: { sourceStripeEventId_component: { sourceStripeEventId: id, component: 'stripe_fee' } },
        });
        await prisma.billingFinancialEvidenceCase.update({ where: { id: evidenceCase.id }, data: {
          fencingToken: 1, leaseExpiresAt: new Date(Date.now() + 60_000),
        } });
        const adapter = { retrieveEvent: jest.fn().mockResolvedValue(event),
          retrieveBalanceTransaction: jest.fn().mockResolvedValue(balance) };
        const fees = new BillingStripeFeeService(adapter as never);
        const claimed = { id: evidenceCase.id, sourceStripeEventId: id,
          component: 'stripe_fee' as const, eventType: 'charge.updated',
          providerReference: `ch_${runId}timestamp${item.label}`, fencingToken: 1, attempts: 1 };
        const retry = new BillingEvidenceRetryService(prisma, adapter as never,
          { claimDue: async () => [claimed], releaseClaim: (...args: [string, number]) => billing.releaseClaim(...args),
            resolveInTransaction: (...args: Parameters<typeof billing.resolveInTransaction>) =>
              billing.resolveInTransaction(...args) } as never,
          fees, { get: () => { throw new Error('receipt must exist'); } } as never);
        await retry.processDueOnce();
        const actual = await prisma.billingFinancialEvidenceCase.findUniqueOrThrow({
          where: { sourceStripeEventId_component: { sourceStripeEventId: id, component: 'stripe_fee' } },
        });
        expect({ label: item.label, state: actual.state }).toEqual({ label: item.label, state: item.state });
        if (item.state === 'resolved_effect' && item.created !== undefined) {
          additionalFeeDays.push(utcDay(new Date(item.created * 1000)));
        }
        if (item.state === 'pending') {
          expect(actual.effectiveAt).toBeNull();
        }
        if (item.state !== 'resolved_effect') {
          expect(await prisma.billingStripeFeeEffect.count({ where: { sourceStripeEventId: id } })).toBe(0);
        }
      }
    } finally {
      await prisma.billingCombinedMetricsBoundary.update({ where: { id: BILLING_COMBINED_BOUNDARY_ID },
        data: { metricsStartAt: original.metricsStartAt } });
      await prisma.billingStripeFeeMetricsBoundary.update({ where: { id: 'stripe_fees_v1' },
        data: { metricsStartAt: feeOriginal.metricsStartAt } });
    }
  });

  it('retains pending cost intents for failure and timeout through real AIService and router', async () => {
    const user = await prisma.user.create({ data: { email: `${runId}@example.test`,
      dataProcessingConsentAt: new Date() } });
    await prisma.subscription.create({ data: { userId: user.id,
      plan: SubscriptionPlan.pro, status: SubscriptionStatus.active } });
    const values: Record<string, unknown> = { AI_PROVIDER: 'openai', AI_FALLBACK_PROVIDERS: '',
      AI_INPUT_COST_PER_MILLION: 1, AI_OUTPUT_COST_PER_MILLION: 1 };
    const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback };
    const provider = { assertReadyForDispatch: jest.fn(),
      complete: jest.fn().mockRejectedValueOnce(new Error('synthetic transport failure'))
      .mockRejectedValueOnce(new Error('synthetic timeout')) };
    const factory = new AIProviderFactory(config as never, provider as never,
      { assertReadyForDispatch: jest.fn(), complete: jest.fn() } as never,
      { assertReadyForDispatch: jest.fn(), complete: jest.fn() } as never,
      { getRequestId: () => 'synthetic' } as never);
    const router = new PlanAwareAiRouter(prisma,
      { assertReadyForDispatch: jest.fn(), complete: jest.fn() } as never,
      factory, config as never);
    const ledger = { beginAttempt: async () => {
      const id = await ai.beginAttempt(); attemptIds.push(id); return id;
    }, finalizeAttempt: (input: Parameters<typeof ai.finalizeAttempt>[0]) => ai.finalizeAttempt(input),
      estimateMicroUsd: (...args: Parameters<typeof ai.estimateMicroUsd>) => ai.estimateMicroUsd(...args) };
    const service = new AIService(prisma, factory, router,
      { loadTemplate: () => 'System\n## Resume\n{{resume}}' } as never,
      {} as never,
      { reserve: async () => ({ resetAt: new Date('2026-11-01T00:00:00Z') }),
        release: jest.fn() } as never, ledger as never,
      { now: () => effectiveAt, nowMs: () => effectiveAt.getTime() } as never);
    const previousAttemptCount = attemptIds.length;
    for (let index = 0; index < 2; index += 1) {
      await expect(service.complete(AIRequestFeature.resume_parse, user.id,
        { resume: 'synthetic' })).rejects.toThrow('AI providers are temporarily unavailable');
    }
    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(attemptIds).toHaveLength(previousAttemptCount + 2);
    const pending = await prisma.aiCostIntent.findMany({ where: { id: { in: attemptIds.slice(-2) } } });
    expect(pending.map((entry) => entry.state)).toEqual(['pending', 'pending']);
    expect(await prisma.aiCostEvent.count({ where: { intentId: { in: attemptIds.slice(-2) } } })).toBe(0);
  });

  it('persists distinct paid fallback attempts, including the failed call and successful estimate', async () => {
    const user = await prisma.user.create({ data: { email: `${runId}success@example.test`,
      dataProcessingConsentAt: new Date() } });
    await prisma.subscription.create({ data: { userId: user.id,
      plan: SubscriptionPlan.pro, status: SubscriptionStatus.active } });
    const values: Record<string, unknown> = { AI_PROVIDER: 'openai', AI_FALLBACK_PROVIDERS: 'claude',
      AI_INPUT_COST_PER_MILLION: 1, AI_OUTPUT_COST_PER_MILLION: 1 };
    const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback };
    const first = { assertReadyForDispatch: jest.fn(),
      complete: jest.fn().mockRejectedValue(new Error('synthetic provider failure')) };
    const second = { assertReadyForDispatch: jest.fn(),
      complete: jest.fn().mockResolvedValue({ content: '{}', model: 'synthetic',
      tokensUsed: { input: 2, output: 3 }, usageReported: true }) };
    const factory = new AIProviderFactory(config as never, first as never, second as never,
      { assertReadyForDispatch: jest.fn(), complete: jest.fn() } as never,
      { getRequestId: () => 'synthetic' } as never);
    const router = new PlanAwareAiRouter(prisma,
      { assertReadyForDispatch: jest.fn(), complete: jest.fn() } as never,
      factory, config as never);
    const ledger = { beginAttempt: async () => {
      const id = await ai.beginAttempt(); attemptIds.push(id); return id;
    }, finalizeAttempt: (input: Parameters<typeof ai.finalizeAttempt>[0]) => ai.finalizeAttempt(input),
      estimateMicroUsd: (...args: Parameters<typeof ai.estimateMicroUsd>) => ai.estimateMicroUsd(...args) };
    const service = new AIService(prisma, factory, router,
      { loadTemplate: () => 'System\n## Resume\n{{resume}}' } as never,
      {} as never,
      { reserve: async () => ({ resetAt: new Date('2026-11-01T00:00:00Z') }),
        release: jest.fn() } as never, ledger as never,
      { now: () => effectiveAt, nowMs: () => effectiveAt.getTime() } as never);
    const before = await prisma.aiDailyCostMetric.findUnique({ where: { day: utcDay(effectiveAt) } });
    const previousAttemptCount = attemptIds.length;
    await expect(service.complete(AIRequestFeature.resume_parse, user.id,
      { resume: 'synthetic' })).resolves.toEqual({ content: '{}', model: 'synthetic' });
    expect(first.complete).toHaveBeenCalledTimes(1);
    expect(second.complete).toHaveBeenCalledTimes(1);
    expect(attemptIds).toHaveLength(previousAttemptCount + 2);
    const [failed, successful] = await Promise.all(attemptIds.slice(-2).map((id) =>
      prisma.aiCostIntent.findUniqueOrThrow({ where: { id } })));
    expect(failed.state).toBe('pending');
    expect(successful.state).toBe('costed');
    expect(await prisma.aiCostEvent.count({ where: { intentId: { in: [failed.id, successful.id] } } })).toBe(1);
    const after = await prisma.aiDailyCostMetric.findUniqueOrThrow({ where: { day: utcDay(effectiveAt) } });
    expect(after.estimatedMicroUsd - (before?.estimatedMicroUsd ?? 0n)).toBe(5n);
    expect(after.costedRequestCount - (before?.costedRequestCount ?? 0)).toBe(1);
  });

  it('does not persist intents for configuration rejection but captures the dispatched fallback', async () => {
    const user = await prisma.user.create({ data: { email: `${runId}config@example.test`,
      dataProcessingConsentAt: new Date() } });
    await prisma.subscription.create({ data: { userId: user.id,
      plan: SubscriptionPlan.pro, status: SubscriptionStatus.active } });
    const values: Record<string, unknown> = {
      AI_PROVIDER: 'openai', AI_FALLBACK_PROVIDERS: 'claude',
      OPENAI_API_KEY: '', ANTHROPIC_API_KEY: 'synthetic-key', GOOGLE_AI_API_KEY: '',
      GLM_FREE_PLAN_API_KEY: '', GLM_FREE_PLAN_BASE_URL: 'https://glm.example.test/v1',
      GLM_FREE_PLAN_MODEL: 'glm-test', AI_INPUT_COST_PER_MILLION: 1,
      AI_OUTPUT_COST_PER_MILLION: 1,
    };
    const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback };
    const openai = new OpenAIProvider(config as never);
    const claude = new ClaudeProvider(config as never);
    const gemini = new GeminiProvider(config as never);
    const glm = new GlmProvider(config as never);
    const openaiCall = jest.fn();
    const claudeCall = jest.fn().mockResolvedValue({ content: '{}', model: 'synthetic',
      tokensUsed: { input: 2, output: 3 }, usageReported: true });
    const glmCall = jest.fn();
    const factory = new AIProviderFactory(config as never,
      { assertReadyForDispatch: () => openai.assertReadyForDispatch(), complete: openaiCall } as never,
      { assertReadyForDispatch: () => claude.assertReadyForDispatch(), complete: claudeCall } as never,
      { assertReadyForDispatch: () => gemini.assertReadyForDispatch(), complete: jest.fn() } as never,
      { getRequestId: () => 'synthetic' } as never);
    const router = new PlanAwareAiRouter(prisma,
      { assertReadyForDispatch: () => glm.assertReadyForDispatch(), complete: glmCall } as never,
      factory, config as never);
    const ledger = { beginAttempt: async () => {
      const id = await ai.beginAttempt(); attemptIds.push(id); return id;
    }, finalizeAttempt: (input: Parameters<typeof ai.finalizeAttempt>[0]) => ai.finalizeAttempt(input),
      estimateMicroUsd: (...args: Parameters<typeof ai.estimateMicroUsd>) => ai.estimateMicroUsd(...args) };
    const quota = { reserve: async () => ({ resetAt: new Date('2026-11-01T00:00:00Z') }),
      release: jest.fn() };
    const service = new AIService(prisma, factory, router,
      { loadTemplate: () => 'System\n## Resume\n{{resume}}' } as never,
      {} as never, quota as never, ledger as never,
      { now: () => effectiveAt, nowMs: () => effectiveAt.getTime() } as never);
    const complete = () => service.complete(AIRequestFeature.resume_parse, user.id, { resume: 'synthetic' });
    const initialCount = await prisma.aiCostIntent.count();
    await expect(complete()).resolves.toEqual({ content: '{}', model: 'synthetic' });
    expect(openaiCall).not.toHaveBeenCalled();
    expect(claudeCall).toHaveBeenCalledTimes(1);
    expect(await prisma.aiCostIntent.count()).toBe(initialCount + 1);
    expect((await prisma.aiCostIntent.findUniqueOrThrow({ where: { id: attemptIds[attemptIds.length - 1]! } })).state)
      .toBe('costed');

    values.ANTHROPIC_API_KEY = '';
    await expect(complete()).rejects.toThrow('AI providers are temporarily unavailable');
    expect(await prisma.aiCostIntent.count()).toBe(initialCount + 1);
    expect(quota.release).toHaveBeenCalledTimes(1);

    await prisma.subscription.update({ where: { userId: user.id }, data: { plan: SubscriptionPlan.free } });
    await expect(complete()).rejects.toThrow('The Free AI service is temporarily unavailable');
    expect(glmCall).not.toHaveBeenCalled();
    expect(await prisma.aiCostIntent.count()).toBe(initialCount + 1);
    expect(quota.release).toHaveBeenCalledTimes(2);
  });
});

import type Stripe from 'stripe';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { BillingService } from '../src/modules/billing/application/billing.service';
import { SubscriptionLifecycleService } from '../src/modules/billing/application/subscription-lifecycle.service';
import {
  BILLING_REFUND_METRICS_BOUNDARY_ID,
  BillingFinancialMetricsRecorderService,
} from '../src/modules/billing/application/billing-financial-metrics-recorder.service';
import { BillingRefundMetricsReadService } from '../src/modules/billing/application/billing-refund-metrics-read.service';

const runId = `refund-ledger-${process.pid}-${Date.now()}`;
const DAY_MS = 86_400_000;
const eventIds: string[] = [];
const refundIds: string[] = [];
const day = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

describe('Billing refund ledger PostgreSQL integration', () => {
  let prisma: PrismaService;
  let billing: BillingService;
  let reader: BillingRefundMetricsReadService;
  let boundary: Date;
  let future: Date;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error('Integration requires an isolated test DATABASE_URL');
    }
    prisma = new PrismaService();
    await prisma.$connect();
    boundary = (await prisma.billingRefundMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_REFUND_METRICS_BOUNDARY_ID },
      select: { metricsStartAt: true },
    })).metricsStartAt;
    future = new Date(day(boundary).getTime() + DAY_MS + 10_000);
    billing = new BillingService(
      prisma, {} as never, new SubscriptionLifecycleService(),
      new BillingFinancialMetricsRecorderService(),
      { prepare: async () => null } as never,
      { now: () => new Date(future.getTime() + DAY_MS) } as never,
    );
    reader = new BillingRefundMetricsReadService(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    const records = await prisma.billingRefund.findMany({
      where: { stripeRefundId: { in: refundIds } }, select: { id: true },
    });
    const ids = records.map((record) => record.id);
    await prisma.billingRefundEffect.deleteMany({ where: { refundId: { in: ids } } });
    await prisma.billingRefundObservation.deleteMany({ where: { refundId: { in: ids } } });
    await prisma.billingRefund.deleteMany({ where: { id: { in: ids } } });
    await prisma.stripeWebhookEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    if (future) {
      await prisma.billingDailyRefundMetric.deleteMany({
        where: { day: { gte: day(boundary), lt: new Date(day(future).getTime() + DAY_MS) } },
      });
    }
    await prisma.user.deleteMany({ where: { email: `${runId}@example.test` } });
    await prisma.$disconnect();
  });

  const makeEvent = (
    label: string,
    refundLabel: string,
    status: string,
    at: Date,
    amountMinor = 1_900,
    currency = 'usd',
    type = 'refund.updated',
    providerCreatedAt = at,
  ): Stripe.Event => {
    const id = `${runId}-${label}`;
    const refundId = `re_${runId.replace(/[^a-zA-Z0-9]/g, '')}${refundLabel}`;
    eventIds.push(id);
    refundIds.push(refundId);
    return {
      id, type, created: Math.floor(at.getTime() / 1000),
      data: { object: {
        object: 'refund', id: refundId, amount: amountMinor, currency, status,
        created: Math.floor(providerCreatedAt.getTime() / 1000),
        charge: 'ch_synthetic', payment_intent: 'pi_synthetic',
        metadata: { token: 'synthetic-should-never-persist' },
      } },
    } as unknown as Stripe.Event;
  };

  it('stores pending, action-required, failed and canceled observations without effects', async () => {
    for (const status of ['pending', 'requires_action', 'failed', 'canceled']) {
      await billing.handleWebhook(makeEvent(`state-${status}`, `state${status.replace('_', '')}`, status, future));
    }
    expect(await prisma.billingRefundObservation.count({ where: { sourceStripeEventId: { in: eventIds } } })).toBe(4);
    expect(await prisma.billingRefundEffect.count({ where: { sourceStripeEventId: { in: eventIds } } })).toBe(0);
  });

  it('creates one effect for pending to succeeded, duplicate delivery and out-of-order pending', async () => {
    const pending = makeEvent('transition-pending', 'transition', 'pending', future, 2_200);
    const succeeded = makeEvent('transition-success', 'transition', 'succeeded', future, 2_200);
    const latePending = makeEvent('transition-late-pending', 'transition', 'pending', new Date(future.getTime() - 1_000), 2_200, 'usd', 'refund.updated', future);
    await billing.handleWebhook(pending);
    const concurrent = await Promise.all([billing.handleWebhook(succeeded), billing.handleWebhook(succeeded)]);
    expect(concurrent).toEqual(expect.arrayContaining([{ received: true }, { received: true, duplicate: true }]));
    await billing.handleWebhook(latePending);
    expect(await prisma.billingRefundObservation.count({ where: { refund: { stripeRefundId: (succeeded.data.object as Stripe.Refund).id } } })).toBe(3);
    const effect = await prisma.billingRefundEffect.findUniqueOrThrow({ where: { sourceStripeEventId: succeeded.id } });
    expect(effect.amountMinor).toBe(-2_200n);
    expect(effect.effectiveAt).toEqual(new Date(Math.floor(future.getTime() / 1000) * 1000));
    expect(await prisma.billingRefundEffect.count({ where: { refundId: effect.refundId } })).toBe(1);
  });

  it('allows concurrent distinct events for the same refund to claim exactly one financial effect', async () => {
    const first = makeEvent('raced-success-one', 'racedsuccess', 'succeeded', future, 375);
    const second = makeEvent('raced-success-two', 'racedsuccess', 'succeeded', future, 375);
    await expect(Promise.all([billing.handleWebhook(first), billing.handleWebhook(second)]))
      .resolves.toEqual([{ received: true }, { received: true }]);
    const refundId = (first.data.object as Stripe.Refund).id;
    const refund = await prisma.billingRefund.findUniqueOrThrow({ where: { stripeRefundId: refundId } });
    expect(await prisma.billingRefundObservation.count({ where: { refundId: refund.id } })).toBe(2);
    expect(await prisma.billingRefundEffect.count({ where: { refundId: refund.id } })).toBe(1);
  });

  it('counts already-succeeded full and multiple partial refunds separately without changing gross', async () => {
    const beforeGross = await prisma.billingFinancialEvent.count();
    for (const [name, amount] of [['full', 4_900], ['partial-one', 1_000], ['partial-two', 900]] as const) {
      await billing.handleWebhook(makeEvent(name, name.replace('-', ''), 'succeeded', future, amount, 'usd', name === 'full' ? 'refund.created' : 'refund.updated'));
    }
    const effects = await prisma.billingRefundEffect.findMany({ where: { sourceStripeEventId: { in: eventIds } } });
    expect(effects).toHaveLength(5);
    expect(effects.reduce((sum, effect) => sum + effect.amountMinor, 0n)).toBe(-9_375n);
    expect(await prisma.billingFinancialEvent.count()).toBe(beforeGross);
  });

  it('retains non-USD and pre-boundary successes but excludes them from USD adjustments', async () => {
    const beforeEffects = await prisma.billingRefundEffect.count({ where: { sourceStripeEventId: { in: eventIds } } });
    const nonUsd = makeEvent('eur', 'eur', 'succeeded', future, 1_700, 'eur');
    const preBoundary = makeEvent('pre-boundary', 'preboundary', 'succeeded', new Date(boundary.getTime() - 2_000));
    await billing.handleWebhook(nonUsd);
    await billing.handleWebhook(preBoundary);
    const stored = await prisma.billingRefund.findUniqueOrThrow({ where: { stripeRefundId: (nonUsd.data.object as Stripe.Refund).id } });
    expect(stored.currencySupport).toBe('unsupported');
    expect(await prisma.billingRefundEffect.count({ where: { sourceStripeEventId: { in: eventIds } } })).toBe(beforeEffects);
  });

  it('records unsupported charge-level delivery without a second refund observation or effect', async () => {
    const beforeObservations = await prisma.billingRefundObservation.count({ where: { sourceStripeEventId: { in: eventIds } } });
    const beforeEffects = await prisma.billingRefundEffect.count({ where: { sourceStripeEventId: { in: eventIds } } });
    const chargeEvent = makeEvent('charge-refunded', 'unsupportedcharge', 'succeeded', future, 1_900, 'usd', 'charge.refunded');
    await expect(billing.handleWebhook(chargeEvent)).resolves.toEqual({ received: true });
    expect(await prisma.stripeWebhookEvent.findUnique({ where: { eventId: chargeEvent.id } })).not.toBeNull();
    expect(await prisma.billingRefundObservation.count({ where: { sourceStripeEventId: { in: eventIds } } })).toBe(beforeObservations);
    expect(await prisma.billingRefundEffect.count({ where: { sourceStripeEventId: { in: eventIds } } })).toBe(beforeEffects);
  });

  it('buckets delayed post-boundary success by event time even when provider creation preceded boundary', async () => {
    const delayed = makeEvent('delayed', 'delayed', 'succeeded', future, 750, 'usd', 'refund.updated', new Date(boundary.getTime() - DAY_MS));
    await billing.handleWebhook(delayed);
    const effect = await prisma.billingRefundEffect.findUniqueOrThrow({ where: { sourceStripeEventId: delayed.id } });
    expect(effect.effectiveAt).toEqual(new Date(Math.floor(future.getTime() / 1000) * 1000));
    const refund = await prisma.billingRefund.findUniqueOrThrow({ where: { stripeRefundId: (delayed.data.object as Stripe.Refund).id } });
    expect(refund.providerCreatedAt.getTime()).toBeLessThan(boundary.getTime());
  });

  it('returns bounded negative adjustment days and unavailable pre-boundary coverage with no identifiers', async () => {
    const pre = await reader.getMetrics({ from: new Date(day(boundary).getTime() - DAY_MS), toExclusive: day(boundary) });
    expect(pre).toEqual(expect.objectContaining({ totals: null, actualCoveredRange: null, daily: [] }));
    const covered = await reader.getMetrics({ from: day(boundary), toExclusive: new Date(day(future).getTime() + DAY_MS) });
    expect(covered.daily[0]?.coverage).toBe('partial');
    expect(covered.totals?.refundAdjustmentMinor).toBe(-10_125);
    expect(covered.totals?.successfulRefundCount).toBe(6);
    expect(JSON.stringify(covered)).not.toMatch(/refundId|chargeId|paymentIntent|customer|invoice|metadata|token|secret|url/i);
  });

  it('rolls back the webhook row and observation when refund persistence fails', async () => {
    const failure = makeEvent('rollback', 'rollback', 'succeeded', future);
    const failing = new BillingService(prisma, {} as never, new SubscriptionLifecycleService(), {
      recordRefundInTransaction: async (tx: typeof prisma) => {
        await tx.billingRefundObservation.create({ data: {
          refund: { create: { stripeRefundId: 're_rollbacktemporary', amountMinor: 1n, currency: 'usd', currencySupport: 'usd', providerCreatedAt: future } },
          sourceEvent: { connect: { eventId: failure.id } }, status: 'pending', eventAt: future,
        } });
        throw new Error('synthetic refund persistence failure');
      },
    } as never, { prepare: async () => null } as never);
    await expect(failing.handleWebhook(failure)).rejects.toThrow('synthetic refund persistence failure');
    expect(await prisma.stripeWebhookEvent.findUnique({ where: { eventId: failure.id } })).toBeNull();
    expect(await prisma.billingRefund.findUnique({ where: { stripeRefundId: 're_rollbacktemporary' } })).toBeNull();
  });

  it('retains opaque refund history after local user, subscription and payment deletion', async () => {
    const user = await prisma.user.create({ data: {
      email: `${runId}@example.test`,
      subscription: { create: { payments: { create: {
        amount: 1_900,
        status: 'succeeded',
        stripePaymentId: 'pi_synthetic',
        createdAt: new Date(boundary.getTime() - DAY_MS),
      } } } },
    } });
    const refundEvent = makeEvent('after-deletion', 'afterdeletion', 'succeeded', future, 250);
    await billing.handleWebhook(refundEvent);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.billingRefund.findUnique({ where: { stripeRefundId: (refundEvent.data.object as Stripe.Refund).id } })).not.toBeNull();
    expect(await prisma.billingRefundEffect.findUnique({ where: { sourceStripeEventId: refundEvent.id } })).not.toBeNull();
  });
});

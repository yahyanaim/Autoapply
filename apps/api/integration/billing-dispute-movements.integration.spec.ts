import type Stripe from 'stripe';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { BillingService } from '../src/modules/billing/application/billing.service';
import { SubscriptionLifecycleService } from '../src/modules/billing/application/subscription-lifecycle.service';
import {
  BILLING_DISPUTE_METRICS_BOUNDARY_ID,
  BillingFinancialMetricsRecorderService,
} from '../src/modules/billing/application/billing-financial-metrics-recorder.service';
import { BillingDisputeMetricsReadService } from '../src/modules/billing/application/billing-dispute-metrics-read.service';

const runId = `dispute-ledger-${process.pid}-${Date.now()}`;
const DAY_MS = 86_400_000;
const eventIds: string[] = [];
const disputeIds: string[] = [];
const refundIds: string[] = [];
const utcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

describe('Billing dispute movements PostgreSQL integration', () => {
  let prisma: PrismaService;
  let billing: BillingService;
  let reader: BillingDisputeMetricsReadService;
  let boundary: Date;
  let future: Date;
  let retrieveDispute: jest.Mock;

  const balance = (id: string, amount: number, at: Date, currency = 'usd') => ({
    id, object: 'balance_transaction', amount, currency,
    created: Math.floor(at.getTime() / 1_000),
  });
  const disputeEvent = (
    label: string,
    disputeLabel: string,
    type: string,
    status: string,
    eventAt: Date,
    balanceTransactions: unknown[] = [],
    currency = 'usd',
  ): Stripe.Event => {
    const id = `${runId}-${label}`;
    const disputeId = `du_${runId.replace(/[^a-zA-Z0-9]/g, '')}${disputeLabel}`;
    eventIds.push(id);
    disputeIds.push(disputeId);
    return {
      id, type, created: Math.floor(eventAt.getTime() / 1_000),
      data: { object: {
        id: disputeId, object: 'dispute', amount: 10_000, status, currency,
        created: Math.floor(future.getTime() / 1_000),
        charge: 'ch_synthetic', payment_intent: 'pi_synthetic',
        balance_transactions: balanceTransactions,
        evidence: { customer_email_address: 'never-store@example.test' },
        metadata: { secret: 'never-store' },
      } },
    } as unknown as Stripe.Event;
  };
  const refundEvent = (label: string, amount: number): Stripe.Event => {
    const id = `${runId}-${label}`;
    const refundId = `re_${runId.replace(/[^a-zA-Z0-9]/g, '')}${label.replace(/[^a-zA-Z0-9]/g, '')}`;
    eventIds.push(id);
    refundIds.push(refundId);
    return {
      id, type: 'refund.created', created: Math.floor(future.getTime() / 1_000),
      data: { object: {
        id: refundId, object: 'refund', amount, currency: 'usd', status: 'succeeded',
        created: Math.floor(future.getTime() / 1_000),
        charge: 'ch_synthetic', payment_intent: 'pi_synthetic',
      } },
    } as unknown as Stripe.Event;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error('Integration requires an isolated test DATABASE_URL');
    }
    prisma = new PrismaService();
    await prisma.$connect();
    boundary = (await prisma.billingDisputeMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_DISPUTE_METRICS_BOUNDARY_ID },
      select: { metricsStartAt: true },
    })).metricsStartAt;
    future = new Date(utcDay(boundary).getTime() + DAY_MS + 10_000);
    retrieveDispute = jest.fn();
    billing = new BillingService(
      prisma,
      { retrieveDispute } as never,
      new SubscriptionLifecycleService(),
      new BillingFinancialMetricsRecorderService(),
      { prepare: async () => null } as never,
      { now: () => new Date(future.getTime() + DAY_MS) } as never,
    );
    reader = new BillingDisputeMetricsReadService(prisma);
  });

  beforeEach(() => retrieveDispute.mockReset());

  afterAll(async () => {
    if (!prisma) return;
    const disputes = await prisma.billingDispute.findMany({
      where: { stripeDisputeId: { in: disputeIds } }, select: { id: true },
    });
    const ids = disputes.map((dispute) => dispute.id);
    await prisma.billingDisputeEffect.deleteMany({ where: { disputeId: { in: ids } } });
    await prisma.billingDisputeObservation.deleteMany({ where: { disputeId: { in: ids } } });
    await prisma.billingDispute.deleteMany({ where: { id: { in: ids } } });
    const refunds = await prisma.billingRefund.findMany({
      where: { stripeRefundId: { in: refundIds } }, select: { id: true },
    });
    const refundLocalIds = refunds.map((refund) => refund.id);
    await prisma.billingRefundEffect.deleteMany({ where: { refundId: { in: refundLocalIds } } });
    await prisma.billingRefundObservation.deleteMany({ where: { refundId: { in: refundLocalIds } } });
    await prisma.billingRefund.deleteMany({ where: { id: { in: refundLocalIds } } });
    await prisma.stripeWebhookEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    if (future) {
      const where = { day: { gte: utcDay(boundary), lt: new Date(utcDay(future).getTime() + DAY_MS) } };
      await prisma.billingDailyDisputeMetric.deleteMany({ where });
      await prisma.billingDailyRefundMetric.deleteMany({ where });
    }
    await prisma.user.deleteMany({ where: { email: `${runId}@example.test` } });
    await prisma.$disconnect();
  });

  it('keeps status-only created, updated, closed, won and lost events money-free and monotonic', async () => {
    const closed = disputeEvent('closed-first', 'statusonly', 'charge.dispute.closed', 'won',
      new Date(future.getTime() + 30_000));
    const stale = disputeEvent('stale-updated', 'statusonly', 'charge.dispute.updated', 'under_review',
      new Date(future.getTime() + 10_000));
    const created = disputeEvent('created-late', 'statusonly', 'charge.dispute.created', 'needs_response', future);
    await billing.handleWebhook(closed);
    await billing.handleWebhook(stale);
    await billing.handleWebhook(created);
    const stored = await prisma.billingDispute.findUniqueOrThrow({
      where: { stripeDisputeId: (closed.data.object as Stripe.Dispute).id },
    });
    expect(stored.currentStatus).toBe('won');
    expect(await prisma.billingDisputeObservation.count({ where: { disputeId: stored.id } })).toBe(3);
    expect(await prisma.billingDisputeEffect.count({ where: { disputeId: stored.id } })).toBe(0);
    const lost = disputeEvent('lost-status', 'lostonly', 'charge.dispute.closed', 'lost', future);
    await billing.handleWebhook(lost);
    expect(await prisma.billingDisputeEffect.count({ where: { sourceStripeEventId: lost.id } })).toBe(0);
  });

  it('records refund and distinct actual dispute movements without overcounting the dispute face amount', async () => {
    const refund = refundEvent('refund-overlap', 4_000);
    await billing.handleWebhook(refund);
    const withdrawal = disputeEvent('withdrawal', 'overlap', 'charge.dispute.funds_withdrawn',
      'needs_response', future, [balance('txn_withdraw6000', -6_000, future)]);
    const reinstatement = disputeEvent('reinstatement', 'overlap', 'charge.dispute.funds_reinstated',
      'won', new Date(future.getTime() + 20_000), [
        balance('txn_withdraw6000', -6_000, future),
        balance('txn_restore2000', 2_000, new Date(future.getTime() + 20_000)),
      ]);
    const grossBefore = await prisma.billingFinancialEvent.count();
    await billing.handleWebhook(withdrawal);
    await billing.handleWebhook(reinstatement);
    const effects = await prisma.billingDisputeEffect.findMany({
      where: { sourceStripeEventId: { in: [withdrawal.id, reinstatement.id] } },
      orderBy: { amountMinor: 'asc' },
    });
    expect(effects.map((effect) => effect.amountMinor)).toEqual([-6_000n, 2_000n]);
    expect((await prisma.billingRefundEffect.findUniqueOrThrow({
      where: { sourceStripeEventId: refund.id },
    })).amountMinor).toBe(-4_000n);
    expect(await prisma.billingFinancialEvent.count()).toBe(grossBefore);
    expect(JSON.stringify(effects, (_key, value) => typeof value === 'bigint' ? value.toString() : value))
      .not.toMatch(/customer|email|evidence|metadata|secret|card|prompt|resume/i);
  });

  it('deduplicates concurrent identical and semantically equivalent withdrawal deliveries', async () => {
    const day = utcDay(future);
    const dailyBefore = await prisma.billingDailyDisputeMetric.findUnique({
      where: { day_currency: { day, currency: 'usd' } },
      select: { withdrawnMinor: true, withdrawalCount: true },
    });
    const first = disputeEvent('race-one', 'race', 'charge.dispute.funds_withdrawn',
      'needs_response', future, [balance('txn_race1', -500, future)]);
    const second = disputeEvent('race-two', 'race', 'charge.dispute.funds_withdrawn',
      'needs_response', future, [balance('txn_race1', -500, future)]);
    await expect(Promise.all([billing.handleWebhook(first), billing.handleWebhook(first)]))
      .resolves.toEqual(expect.arrayContaining([{ received: true }, { received: true, duplicate: true }]));
    await expect(billing.handleWebhook(second)).resolves.toEqual({ received: true });
    const stored = await prisma.billingDispute.findUniqueOrThrow({
      where: { stripeDisputeId: (first.data.object as Stripe.Dispute).id },
    });
    expect(await prisma.billingDisputeEffect.count({ where: { disputeId: stored.id } })).toBe(1);
    const dailyAfter = await prisma.billingDailyDisputeMetric.findUniqueOrThrow({
      where: { day_currency: { day, currency: 'usd' } },
      select: { withdrawnMinor: true, withdrawalCount: true },
    });
    expect(dailyAfter.withdrawnMinor - (dailyBefore?.withdrawnMinor ?? 0n)).toBe(-500n);
    expect(dailyAfter.withdrawalCount - (dailyBefore?.withdrawalCount ?? 0)).toBe(1);
    expect(await prisma.billingDisputeObservation.count({ where: { disputeId: stored.id } })).toBe(2);
    const observation = await prisma.billingDisputeObservation.findUniqueOrThrow({
      where: { sourceStripeEventId: second.id },
    });
    expect(observation.resolution).toBe('duplicate_movement');
  });

  it('uses a retrieved dispute if the webhook omits the balance transaction', async () => {
    const missing = disputeEvent('lookup', 'lookup', 'charge.dispute.funds_withdrawn', 'needs_response', future);
    retrieveDispute.mockResolvedValueOnce({
      id: (missing.data.object as Stripe.Dispute).id,
      balance_transactions: [balance('txn_lookup1', -700, future)],
    });
    await billing.handleWebhook(missing);
    expect(retrieveDispute).toHaveBeenCalledWith((missing.data.object as Stripe.Dispute).id);
    expect((await prisma.billingDisputeEffect.findUniqueOrThrow({ where: { sourceStripeEventId: missing.id } })).amountMinor).toBe(-700n);
  });

  it('records explicit unresolved no-effect status when successful lookup still lacks movement evidence', async () => {
    const missing = disputeEvent('unresolved', 'unresolved', 'charge.dispute.funds_reinstated', 'won', future);
    retrieveDispute.mockResolvedValueOnce({ id: (missing.data.object as Stripe.Dispute).id, balance_transactions: [] });
    await billing.handleWebhook(missing);
    const observation = await prisma.billingDisputeObservation.findUniqueOrThrow({ where: { sourceStripeEventId: missing.id } });
    expect(observation.resolution).toBe('missing_authoritative_transaction');
    expect(await prisma.billingDisputeEffect.findUnique({ where: { sourceStripeEventId: missing.id } })).toBeNull();
    await expect(billing.handleWebhook(missing)).resolves.toEqual({ received: true, duplicate: true });
    expect(retrieveDispute).toHaveBeenCalledTimes(1);
  });

  it('rolls back or avoids all writes when Stripe lookup or accounting persistence fails', async () => {
    const transient = disputeEvent('lookup-failure', 'lookupfailure', 'charge.dispute.funds_withdrawn', 'needs_response', future);
    retrieveDispute.mockRejectedValueOnce(new Error('synthetic transient Stripe failure'));
    await expect(billing.handleWebhook(transient)).rejects.toThrow('synthetic transient Stripe failure');
    expect(await prisma.stripeWebhookEvent.findUnique({ where: { eventId: transient.id } })).toBeNull();
    const failing = disputeEvent('db-rollback', 'dbrollback', 'charge.dispute.funds_withdrawn',
      'needs_response', future, [balance('txn_rollback1', -200, future)]);
    const rollbackBilling = new BillingService(prisma, { retrieveDispute } as never,
      new SubscriptionLifecycleService(), {
        recordDisputeInTransaction: async (tx: typeof prisma) => {
          await tx.billingDispute.create({ data: {
            stripeDisputeId: 'du_rollbacktemporary', currency: 'usd',
            providerCreatedAt: future, currentStatus: 'needs_response',
            currentStatusEventAt: future, currentStatusEventId: failing.id,
          } });
          throw new Error('synthetic dispute persistence failure');
        },
      } as never, { prepare: async () => null } as never);
    await expect(rollbackBilling.handleWebhook(failing)).rejects.toThrow('synthetic dispute persistence failure');
    expect(await prisma.stripeWebhookEvent.findUnique({ where: { eventId: failing.id } })).toBeNull();
    expect(await prisma.billingDispute.findUnique({ where: { stripeDisputeId: 'du_rollbacktemporary' } })).toBeNull();
  });

  it('keeps non-USD and pre-boundary movements as observations without USD effects', async () => {
    const eur = disputeEvent('eur', 'eur', 'charge.dispute.funds_withdrawn', 'needs_response', future,
      [balance('txn_eur1', -100, future, 'eur')], 'eur');
    const pre = disputeEvent('preboundary', 'preboundary', 'charge.dispute.funds_withdrawn', 'needs_response', future,
      [balance('txn_preboundary1', -100, new Date(boundary.getTime() - 2_000))]);
    await billing.handleWebhook(eur);
    await billing.handleWebhook(pre);
    expect((await prisma.billingDisputeObservation.findUniqueOrThrow({ where: { sourceStripeEventId: eur.id } })).resolution)
      .toBe('unsupported_currency');
    expect((await prisma.billingDisputeObservation.findUniqueOrThrow({ where: { sourceStripeEventId: pre.id } })).resolution)
      .toBe('pre_boundary');
    expect(await prisma.billingDisputeEffect.count({ where: { sourceStripeEventId: { in: [eur.id, pre.id] } } })).toBe(0);
  });

  it('returns bounded UTC daily movements and does not expose provider identifiers', async () => {
    const pre = await reader.getMetrics({
      from: new Date(utcDay(boundary).getTime() - DAY_MS), toExclusive: utcDay(boundary),
    });
    expect(pre).toEqual(expect.objectContaining({ totals: null, actualCoveredRange: null, daily: [] }));
    const result = await reader.getMetrics({
      from: utcDay(boundary), toExclusive: new Date(utcDay(future).getTime() + DAY_MS),
    });
    expect(result.daily[0]?.coverage).toBe('partial');
    expect(result.totals?.withdrawnMinor).toBe(-7_200);
    expect(result.totals?.reinstatedMinor).toBe(2_000);
    expect(JSON.stringify(result)).not.toMatch(/disputeId|chargeId|paymentIntent|customer|email|metadata|evidence|secret|token/i);
  });

  it('resolves simultaneous distinct webhook events for the same movement to one effect', async () => {
    const day = utcDay(future);
    const dailyBefore = await prisma.billingDailyDisputeMetric.findUnique({
      where: { day_currency: { day, currency: 'usd' } },
      select: { withdrawnMinor: true, withdrawalCount: true },
    });
    const first = disputeEvent('simultaneous-one', 'simultaneous', 'charge.dispute.funds_withdrawn',
      'needs_response', future, [balance('txn_simultaneous1', -450, future)]);
    const second = disputeEvent('simultaneous-two', 'simultaneous', 'charge.dispute.funds_withdrawn',
      'needs_response', future, [balance('txn_simultaneous1', -450, future)]);
    await expect(Promise.all([billing.handleWebhook(first), billing.handleWebhook(second)]))
      .resolves.toEqual([{ received: true }, { received: true }]);
    const dispute = await prisma.billingDispute.findUniqueOrThrow({
      where: { stripeDisputeId: (first.data.object as Stripe.Dispute).id },
    });
    expect(await prisma.billingDisputeObservation.count({ where: { disputeId: dispute.id } })).toBe(2);
    expect(await prisma.billingDisputeEffect.count({ where: { disputeId: dispute.id } })).toBe(1);
    const dailyAfter = await prisma.billingDailyDisputeMetric.findUniqueOrThrow({
      where: { day_currency: { day, currency: 'usd' } },
      select: { withdrawnMinor: true, withdrawalCount: true },
    });
    expect(dailyAfter.withdrawnMinor - (dailyBefore?.withdrawnMinor ?? 0n)).toBe(-450n);
    expect(dailyAfter.withdrawalCount - (dailyBefore?.withdrawalCount ?? 0)).toBe(1);
  });

  it('accepts reinstatement before withdrawal without downgrading newer dispute status', async () => {
    const later = disputeEvent('out-of-order-restore', 'outoforder', 'charge.dispute.funds_reinstated',
      'won', new Date(future.getTime() + 20_000), [
        balance('txn_outwithdraw1', -800, future),
        balance('txn_outrestore1', 800, new Date(future.getTime() + 20_000)),
      ]);
    const earlier = disputeEvent('out-of-order-withdraw', 'outoforder', 'charge.dispute.funds_withdrawn',
      'needs_response', future, [balance('txn_outwithdraw1', -800, future)]);
    await billing.handleWebhook(later);
    await billing.handleWebhook(earlier);
    const dispute = await prisma.billingDispute.findUniqueOrThrow({
      where: { stripeDisputeId: (later.data.object as Stripe.Dispute).id },
    });
    expect(dispute.currentStatus).toBe('won');
    const effects = await prisma.billingDisputeEffect.findMany({ where: { disputeId: dispute.id } });
    expect(effects.map((effect) => effect.amountMinor).sort()).toEqual([-800n, 800n]);
  });

  it('retains dispute observations and effects after local payment, subscription and user deletion', async () => {
    const user = await prisma.user.create({ data: {
      email: `${runId}@example.test`,
      subscription: { create: { payments: { create: {
        amount: 1_000, status: 'succeeded', stripePaymentId: `${runId}-payment`,
      } } } },
    } });
    const event = disputeEvent('deletion', 'deletion', 'charge.dispute.funds_withdrawn',
      'needs_response', future, [balance('txn_delete1', -300, future)]);
    await billing.handleWebhook(event);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.billingDispute.findUnique({ where: { stripeDisputeId: (event.data.object as Stripe.Dispute).id } }))
      .not.toBeNull();
    expect(await prisma.billingDisputeEffect.findUnique({ where: { sourceStripeEventId: event.id } }))
      .not.toBeNull();
  });
});

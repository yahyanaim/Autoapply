import type Stripe from 'stripe';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { BillingService } from '../src/modules/billing/application/billing.service';
import { BillingFinancialMetricsRecorderService } from '../src/modules/billing/application/billing-financial-metrics-recorder.service';
import { BillingStripeFeeService, BILLING_STRIPE_FEE_BOUNDARY_ID } from '../src/modules/billing/application/billing-stripe-fee.service';
import { BillingStripeFeeMetricsReadService } from '../src/modules/billing/application/billing-stripe-fee-metrics-read.service';
import { SubscriptionLifecycleService } from '../src/modules/billing/application/subscription-lifecycle.service';

const runId = `fee${process.pid}${Date.now()}`;
const DAY_MS = 86_400_000;
const day = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const eventIds: string[] = [];
const transactionIds: string[] = [];
const refundIds: string[] = [];
const disputeIds: string[] = [];

describe('Billing Stripe fee ledger PostgreSQL integration', () => {
  let prisma: PrismaService;
  let billing: BillingService;
  let reader: BillingStripeFeeMetricsReadService;
  let feeService: BillingStripeFeeService;
  let boundary: Date;
  let effectiveAt: Date;
  let observedAt: Date;
  let adapter: {
    retrieveBalanceTransaction: jest.Mock;
    retrieveCharge: jest.Mock;
    retrieveRefund: jest.Mock;
    retrievePaymentIntent: jest.Mock;
  };

  const makeTransaction = (label: string, fee: number | undefined, at = effectiveAt, currency = 'usd') => {
    const id = `txn_${runId}${label}`;
    transactionIds.push(id);
    return { id, object: 'balance_transaction', fee, currency, created: Math.floor(at.getTime() / 1000) };
  };
  const makeEvent = (label: string, transactionId: string | null): Stripe.Event => {
    const id = `evt_${runId}${label}`;
    eventIds.push(id);
    return {
      id, type: 'charge.updated', created: Math.floor(observedAt.getTime() / 1000),
      data: { object: {
        id: `ch_${runId}${label}`, object: 'charge', balance_transaction: transactionId,
        customer: 'cus_should_not_persist', metadata: { secret: 'never-store' },
      } },
    } as unknown as Stripe.Event;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) throw new Error('Isolated test DATABASE_URL required');
    prisma = new PrismaService();
    await prisma.$connect();
    boundary = (await prisma.billingStripeFeeMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_STRIPE_FEE_BOUNDARY_ID }, select: { metricsStartAt: true },
    })).metricsStartAt;
    effectiveAt = new Date(day(boundary).getTime() + 45 * DAY_MS + 12_000);
    observedAt = new Date(effectiveAt.getTime() + 2 * DAY_MS);
    adapter = {
      retrieveBalanceTransaction: jest.fn(), retrieveCharge: jest.fn(),
      retrieveRefund: jest.fn(), retrievePaymentIntent: jest.fn(),
    };
    feeService = new BillingStripeFeeService(adapter as never);
    billing = new BillingService(prisma, adapter as never, new SubscriptionLifecycleService(),
      new BillingFinancialMetricsRecorderService(), feeService,
      { now: () => observedAt } as never);
    reader = new BillingStripeFeeMetricsReadService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    if (!prisma) return;
    const refunds = await prisma.billingRefund.findMany({
      where: { stripeRefundId: { in: refundIds } }, select: { id: true },
    });
    const refundLocalIds = refunds.map(({ id }) => id);
    await prisma.billingRefundEffect.deleteMany({ where: { refundId: { in: refundLocalIds } } });
    await prisma.billingRefundObservation.deleteMany({ where: { refundId: { in: refundLocalIds } } });
    await prisma.billingRefund.deleteMany({ where: { id: { in: refundLocalIds } } });
    const disputes = await prisma.billingDispute.findMany({
      where: { stripeDisputeId: { in: disputeIds } }, select: { id: true },
    });
    const disputeLocalIds = disputes.map(({ id }) => id);
    await prisma.billingDisputeEffect.deleteMany({ where: { disputeId: { in: disputeLocalIds } } });
    await prisma.billingDisputeObservation.deleteMany({ where: { disputeId: { in: disputeLocalIds } } });
    await prisma.billingDispute.deleteMany({ where: { id: { in: disputeLocalIds } } });
    await prisma.billingStripeFeeEffect.deleteMany({ where: { balanceTransactionId: { in: transactionIds } } });
    await prisma.billingStripeFeeObservation.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.billingInvoiceFinancialOutcome.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.stripeWebhookEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.billingDailyStripeFeeMetric.deleteMany({ where: {
      day: { gte: day(effectiveAt), lte: day(observedAt) }, currency: 'usd',
    } });
    await prisma.billingDailyRefundMetric.deleteMany({ where: {
      day: { gte: day(effectiveAt), lte: day(observedAt) }, currency: 'usd',
    } });
    await prisma.billingDailyDisputeMetric.deleteMany({ where: {
      day: { gte: day(effectiveAt), lte: day(observedAt) }, currency: 'usd',
    } });
    await prisma.user.deleteMany({ where: { email: `${runId}@example.test` } });
    await prisma.$disconnect();
  });

  it('records concurrent deliveries for one Balance Transaction once, at its UTC effective day', async () => {
    const tx = makeTransaction('concurrent', 39);
    adapter.retrieveBalanceTransaction.mockResolvedValue(tx);
    const first = makeEvent('one', tx.id);
    const second = makeEvent('two', tx.id);
    await Promise.all([billing.handleWebhook(first), billing.handleWebhook(second)]);
    expect(await prisma.billingStripeFeeEffect.count({ where: { balanceTransactionId: tx.id } })).toBe(1);
    expect(await prisma.billingStripeFeeObservation.count({ where: { sourceStripeEventId: { in: [first.id, second.id] } } })).toBe(2);
    const metric = await prisma.billingDailyStripeFeeMetric.findUniqueOrThrow({
      where: { day_currency: { day: day(effectiveAt), currency: 'usd' } },
    });
    expect({ feeMinor: metric.feeMinor, feeEffectCount: metric.feeEffectCount }).toEqual({ feeMinor: 39n, feeEffectCount: 1 });
    expect(await billing.handleWebhook(first)).toEqual({ received: true, duplicate: true });
  });

  it('deduplicates concurrent re-delivery of the identical Stripe event', async () => {
    const tx = makeTransaction('sameevent', 7);
    adapter.retrieveBalanceTransaction.mockResolvedValue(tx);
    const sameEvent = makeEvent('sameevent', tx.id);
    const results = await Promise.all([billing.handleWebhook(sameEvent), billing.handleWebhook(sameEvent)]);
    expect(results).toContainEqual({ received: true, duplicate: true });
    expect(await prisma.billingStripeFeeEffect.count({ where: { balanceTransactionId: tx.id } })).toBe(1);
    expect(await prisma.billingStripeFeeObservation.count({ where: { sourceStripeEventId: sameEvent.id } })).toBe(1);
  });

  it('deduplicates one Balance Transaction across invoice, charge, refund and dispute webhook paths', async () => {
    const transaction = makeTransaction('crosspath', 19);
    adapter.retrieveBalanceTransaction.mockResolvedValue(transaction);
    const invoiceId = `evt_${runId}crossinvoice`;
    const refundId = `re_${runId}crossrefund`;
    const disputeId = `du_${runId}crossdispute`;
    const refundEventId = `evt_${runId}crossrefund`;
    const disputeEventId = `evt_${runId}crossdispute`;
    eventIds.push(invoiceId, refundEventId, disputeEventId);
    refundIds.push(refundId);
    disputeIds.push(disputeId);
    const invoice = {
      id: invoiceId, type: 'invoice.payment_succeeded', created: Math.floor(observedAt.getTime() / 1000),
      data: { object: { object: 'invoice', id: `in_${runId}`, payment_intent: `pi_${runId}`,
        subscription: null, amount_paid: 1_000, currency: 'usd' } },
    } as unknown as Stripe.Event;
    adapter.retrievePaymentIntent.mockResolvedValue({ id: `pi_${runId}`, latest_charge: `ch_${runId}` });
    adapter.retrieveCharge.mockResolvedValue({ id: `ch_${runId}`, balance_transaction: transaction.id });
    const charge = makeEvent('crosscharge', transaction.id);
    const refund = {
      id: refundEventId, type: 'refund.created', created: Math.floor(observedAt.getTime() / 1000),
      data: { object: {
        object: 'refund', id: refundId, amount: 300, currency: 'usd', status: 'succeeded',
        created: Math.floor(effectiveAt.getTime() / 1000), balance_transaction: transaction.id,
        charge: `ch_${runId}`, payment_intent: `pi_${runId}`,
      } },
    } as unknown as Stripe.Event;
    const dispute = {
      id: disputeEventId, type: 'charge.dispute.funds_withdrawn',
      created: Math.floor(observedAt.getTime() / 1000),
      data: { object: {
        object: 'dispute', id: disputeId, amount: 500, currency: 'usd', status: 'needs_response',
        created: Math.floor(effectiveAt.getTime() / 1000),
        charge: `ch_${runId}`, payment_intent: `pi_${runId}`,
        balance_transactions: [{ object: 'balance_transaction', id: transaction.id,
          amount: -500, currency: 'usd', created: Math.floor(effectiveAt.getTime() / 1000) }],
      } },
    } as unknown as Stripe.Event;
    const grossBefore = await prisma.billingFinancialEvent.count();
    const refundBefore = await prisma.billingRefundEffect.count();
    const disputeBefore = await prisma.billingDisputeEffect.count();
    const metricBefore = await prisma.billingDailyStripeFeeMetric.findUnique({
      where: { day_currency: { day: day(effectiveAt), currency: 'usd' } },
    });

    for (const event of [invoice, charge, refund, dispute]) {
      await billing.handleWebhook(event);
    }

    const sourceEvents = [invoice.id, charge.id, refund.id, dispute.id];
    const observations = await prisma.billingStripeFeeObservation.findMany({
      where: { sourceStripeEventId: { in: sourceEvents } },
      select: { resolution: true },
    });
    expect(observations.map(({ resolution }) => resolution).sort()).toEqual([
      'recorded', 'duplicate_balance_transaction',
      'duplicate_balance_transaction', 'duplicate_balance_transaction',
    ].sort());
    expect(await prisma.billingStripeFeeEffect.count({
      where: { balanceTransactionId: transaction.id },
    })).toBe(1);
    const metric = await prisma.billingDailyStripeFeeMetric.findUniqueOrThrow({
      where: { day_currency: { day: day(effectiveAt), currency: 'usd' } },
    });
    expect(metric.feeMinor - (metricBefore?.feeMinor ?? 0n)).toBe(19n);
    expect(metric.feeEffectCount - (metricBefore?.feeEffectCount ?? 0)).toBe(1);
    expect(await prisma.billingFinancialEvent.count()).toBe(grossBefore);
    expect(await prisma.billingRefundEffect.count()).toBe(refundBefore + 1);
    expect(await prisma.billingDisputeEffect.count()).toBe(disputeBefore + 1);
    expect((await prisma.billingRefundEffect.findUniqueOrThrow({
      where: { sourceStripeEventId: refund.id },
    })).amountMinor).toBe(-300n);
    expect((await prisma.billingDisputeEffect.findUniqueOrThrow({
      where: { sourceStripeEventId: dispute.id },
    })).amountMinor).toBe(-500n);
  });

  it('preserves negative fees, zero/missing evidence, unsupported currency and pre-boundary exclusions', async () => {
    const coveredBefore = await reader.getMetrics({
      from: day(effectiveAt), toExclusive: new Date(day(effectiveAt).getTime() + DAY_MS),
    });
    if (!coveredBefore.totals) throw new Error('Expected covered fee metrics baseline');
    const corrections = [
      ['negative', makeTransaction('negative', -11)],
      ['zero', makeTransaction('zero', 0)],
      ['missing', makeTransaction('missing', undefined)],
      ['eur', makeTransaction('eur', 40, effectiveAt, 'eur')],
      ['old', makeTransaction('old', 25, new Date(boundary.getTime() - 60_000))],
    ] as const;
    const localEventIds: string[] = [];
    for (const [label, tx] of corrections) {
      adapter.retrieveBalanceTransaction.mockResolvedValueOnce(tx);
      const event = makeEvent(label, tx.id);
      localEventIds.push(event.id);
      await billing.handleWebhook(event);
    }
    const observations = await prisma.billingStripeFeeObservation.findMany({
      where: { sourceStripeEventId: { in: localEventIds } },
      select: { resolution: true, sourceStripeEventId: true },
    });
    expect(observations).toHaveLength(localEventIds.length);
    expect(Object.fromEntries(observations.map((observation) => [
      observation.sourceStripeEventId, observation.resolution,
    ]))).toEqual({
      [localEventIds[0]!]: 'recorded',
      [localEventIds[1]!]: 'zero_fee',
      [localEventIds[2]!]: 'missing_authoritative_fee',
      [localEventIds[3]!]: 'unsupported_currency',
      [localEventIds[4]!]: 'pre_boundary',
    });
    const negative = await prisma.billingStripeFeeEffect.findUniqueOrThrow({
      where: { balanceTransactionId: corrections[0][1].id },
    });
    expect(negative.feeMinor).toBe(-11n);
    const covered = await reader.getMetrics({ from: day(effectiveAt), toExclusive: new Date(day(effectiveAt).getTime() + DAY_MS) });
    expect(covered.totals).toEqual({
      feeMinor: coveredBefore.totals.feeMinor - 11,
      feeEffectCount: coveredBefore.totals.feeEffectCount + 1,
    });
    expect(JSON.stringify(covered)).not.toMatch(/cus_should|never-store|txn_|ch_|metadata|secret/i);
  });

  it('keeps transient lookups retryable and rolls back webhook, observation, effect and aggregate on failure', async () => {
    const tx = makeTransaction('rollback', 8, new Date(effectiveAt.getTime() + DAY_MS));
    const event = makeEvent('rollback', tx.id);
    adapter.retrieveBalanceTransaction.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(billing.handleWebhook(event)).rejects.toThrow('provider unavailable');
    expect(await prisma.stripeWebhookEvent.findUnique({ where: { eventId: event.id } })).toBeNull();
    adapter.retrieveBalanceTransaction.mockResolvedValue(tx);
    const failing = new BillingService(prisma, adapter as never, new SubscriptionLifecycleService(),
      new BillingFinancialMetricsRecorderService(), {
        prepare: feeService.prepare.bind(feeService),
        recordInTransaction: async (transaction: Parameters<BillingStripeFeeService['recordInTransaction']>[0],
          sourceId: string, prepared: Parameters<BillingStripeFeeService['recordInTransaction']>[2], at: Date) => {
          await feeService.recordInTransaction(transaction, sourceId, prepared, at);
          throw new Error('synthetic persistence failure');
        },
      } as never, { now: () => observedAt } as never);
    await expect(failing.handleWebhook(event)).rejects.toThrow('synthetic persistence failure');
    expect(await prisma.stripeWebhookEvent.findUnique({ where: { eventId: event.id } })).toBeNull();
    expect(await prisma.billingStripeFeeObservation.findUnique({ where: { sourceStripeEventId: event.id } })).toBeNull();
    expect(await prisma.billingStripeFeeEffect.findUnique({ where: { balanceTransactionId: tx.id } })).toBeNull();
    expect(await prisma.billingDailyStripeFeeMetric.findUnique({ where: {
      day_currency: { day: day(new Date(effectiveAt.getTime() + DAY_MS)), currency: 'usd' },
    } })).toBeNull();
    await billing.handleWebhook(event);
    expect(await prisma.billingStripeFeeEffect.count({ where: { balanceTransactionId: tx.id } })).toBe(1);
  });

  it('returns wholly pre-boundary coverage as unavailable and marks the boundary day partial', async () => {
    const old = await reader.getMetrics({
      from: new Date(day(boundary).getTime() - DAY_MS), toExclusive: day(boundary),
    });
    expect(old.totals).toBeNull();
    expect(old.daily).toEqual([]);
    const boundaryDay = await reader.getMetrics({
      from: day(boundary), toExclusive: new Date(day(boundary).getTime() + DAY_MS),
    });
    expect(boundaryDay.daily[0]?.coverage).toBe('partial');
    expect(boundaryDay.requestedRangeStartsBeforeMetrics).toBe(true);
  });

  it('retains fee history after payment, refund, dispute, subscription and user deletion', async () => {
    const user = await prisma.user.create({ data: { email: `${runId}@example.test` } });
    refundIds.push(`re_${runId}delete`);
    disputeIds.push(`du_${runId}delete`);
    const subscription = await prisma.subscription.create({ data: { userId: user.id } });
    const payment = await prisma.payment.create({ data: {
      subscriptionId: subscription.id, amount: 1_000, status: 'succeeded',
      stripePaymentId: `pi_${runId}delete`,
    } });
    const refund = await prisma.billingRefund.create({ data: {
      stripeRefundId: `re_${runId}delete`, amountMinor: 100n, currency: 'usd',
      currencySupport: 'usd', providerCreatedAt: effectiveAt,
    } });
    const dispute = await prisma.billingDispute.create({ data: {
      stripeDisputeId: `du_${runId}delete`, currency: 'usd',
      providerCreatedAt: effectiveAt, currentStatus: 'needs_response',
      currentStatusEventAt: observedAt, currentStatusEventId: `evt_${runId}deletefixture`,
    } });
    const before = await Promise.all([
      prisma.billingFinancialEvent.count(), prisma.billingRefundEffect.count(),
      prisma.billingDisputeEffect.count(),
    ]);
    const tx = makeTransaction('delete', 13);
    adapter.retrieveBalanceTransaction.mockResolvedValue(tx);
    const event = makeEvent('delete', tx.id);
    await billing.handleWebhook(event);
    const assertHistory = async () => {
      expect(await prisma.billingStripeFeeObservation.count({
        where: { sourceStripeEventId: event.id },
      })).toBe(1);
      expect(await prisma.billingStripeFeeEffect.count({
        where: { balanceTransactionId: tx.id },
      })).toBe(1);
    };
    await prisma.payment.delete({ where: { id: payment.id } });
    await assertHistory();
    await prisma.billingRefund.delete({ where: { id: refund.id } });
    await assertHistory();
    await prisma.billingDispute.delete({ where: { id: dispute.id } });
    await assertHistory();
    await prisma.subscription.delete({ where: { id: subscription.id } });
    await assertHistory();
    await prisma.user.delete({ where: { id: user.id } });
    await assertHistory();
    expect(await Promise.all([
      prisma.billingFinancialEvent.count(), prisma.billingRefundEffect.count(),
      prisma.billingDisputeEffect.count(),
    ])).toEqual(before);
  });
});

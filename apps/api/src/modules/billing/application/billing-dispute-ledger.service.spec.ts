import type Stripe from 'stripe';
import { BadRequestException } from '@nestjs/common';
import { BillingFinancialMetricsRecorderService } from './billing-financial-metrics-recorder.service';
import { selectDisputeMovement } from './billing-dispute-movement';
import { BillingDisputeMetricsReadService } from './billing-dispute-metrics-read.service';

const boundary = new Date('2026-10-02T12:00:00.000Z');
const at = new Date('2026-10-03T12:00:00.000Z');
const transaction = {
  billingDispute: { createMany: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn() },
  billingDisputeMetricsBoundary: { findUniqueOrThrow: jest.fn() },
  billingDisputeEffect: { createMany: jest.fn(), findFirst: jest.fn() },
  billingDailyDisputeMetric: { upsert: jest.fn() },
  billingDisputeObservation: { create: jest.fn() },
};
const recorder = new BillingFinancialMetricsRecorderService();
const movement = (id: string, amount: number, created = at, currency = 'usd') => ({
  object: 'balance_transaction', id, amount, currency,
  created: Math.floor(created.getTime() / 1_000),
});
const event = (
  type: string,
  status = 'needs_response',
  balanceTransactions: unknown[] = [],
  options: { id?: string; currency?: string; eventAt?: Date } = {},
) => ({
  id: options.id ?? 'evt_dispute_1', type,
  created: Math.floor((options.eventAt ?? at).getTime() / 1_000),
  data: { object: {
    object: 'dispute', id: 'du_dispute1', status,
    currency: options.currency ?? 'usd',
    created: Math.floor(at.getTime() / 1_000),
    charge: 'ch_safe1', payment_intent: 'pi_safe1',
    balance_transactions: balanceTransactions,
    evidence: { customer_email_address: 'sensitive@example.test' },
    metadata: { token: 'synthetic-secret' },
  } },
}) as unknown as Stripe.Event;

describe('Billing dispute movement recorder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transaction.billingDispute.createMany.mockResolvedValue({ count: 1 });
    transaction.billingDispute.findUniqueOrThrow.mockResolvedValue({
      id: 'local-dispute', currency: 'usd', providerCreatedAt: at,
    });
    transaction.billingDispute.updateMany.mockResolvedValue({ count: 1 });
    transaction.billingDisputeMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: boundary, currency: 'usd',
    });
    transaction.billingDisputeEffect.createMany.mockResolvedValue({ count: 1 });
  });

  it.each(['charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed'])(
    'records %s status without inferring a movement', async (type) => {
      await recorder.recordDisputeInTransaction(transaction as never, event(type, 'won'), at);
      expect(transaction.billingDisputeObservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'won', resolution: 'status_only' }),
      });
      expect(transaction.billingDisputeEffect.createMany).not.toHaveBeenCalled();
    },
  );

  it('records the actual negative balance transaction, not the dispute face amount', async () => {
    await recorder.recordDisputeInTransaction(transaction as never,
      event('charge.dispute.funds_withdrawn', 'needs_response', [movement('txn_withdraw1', -6_000)]), at);
    expect(transaction.billingDisputeEffect.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        balanceTransactionId: 'txn_withdraw1', amountMinor: -6_000n,
        kind: 'withdrawal',
      })],
      skipDuplicates: true,
    });
    expect(transaction.billingDailyDisputeMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {
        withdrawnMinor: { increment: -6_000n }, withdrawalCount: { increment: 1 },
      } }),
    );
  });

  it('records a distinct positive reinstatement without inferring it from won status', async () => {
    await recorder.recordDisputeInTransaction(transaction as never,
      event('charge.dispute.funds_reinstated', 'won', [
        movement('txn_withdraw1', -6_000), movement('txn_restore1', 4_000),
      ]), at);
    expect(transaction.billingDisputeEffect.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        balanceTransactionId: 'txn_restore1', amountMinor: 4_000n,
        kind: 'reinstatement',
      })], skipDuplicates: true,
    });
  });

  it('records an explicit unresolved observation if lookup succeeded without evidence', async () => {
    await recorder.recordDisputeInTransaction(transaction as never,
      event('charge.dispute.funds_withdrawn'), at,
      { id: 'du_dispute1', balance_transactions: [] } as unknown as Stripe.Dispute);
    expect(transaction.billingDisputeObservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ resolution: 'missing_authoritative_transaction', balanceTransactionId: null }),
    });
    expect(transaction.billingDisputeEffect.createMany).not.toHaveBeenCalled();
  });

  it('marks non-USD and pre-boundary movements without USD effects', async () => {
    transaction.billingDispute.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'local-dispute', currency: 'eur', providerCreatedAt: at,
    });
    await recorder.recordDisputeInTransaction(transaction as never,
      event('charge.dispute.funds_withdrawn', 'needs_response', [movement('txn_eur1', -100, at, 'eur')], { currency: 'eur' }), at);
    expect(transaction.billingDisputeObservation.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ resolution: 'unsupported_currency' }),
    });
    expect(transaction.billingDisputeEffect.createMany).not.toHaveBeenCalled();
    const before = new Date(boundary.getTime() - 1_000);
    await recorder.recordDisputeInTransaction(transaction as never,
      event('charge.dispute.funds_withdrawn', 'needs_response', [movement('txn_old1', -100, before)], { id: 'evt_old' }), at);
    expect(transaction.billingDisputeObservation.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ resolution: 'pre_boundary' }),
    });
    expect(transaction.billingDisputeEffect.createMany).not.toHaveBeenCalled();
  });

  it('rejects a conflicting balance movement instead of silently swallowing it', async () => {
    transaction.billingDisputeEffect.createMany.mockResolvedValueOnce({ count: 0 });
    transaction.billingDisputeEffect.findFirst.mockResolvedValueOnce({
      disputeId: 'local-dispute', balanceTransactionId: 'txn_other', kind: 'withdrawal',
      amountMinor: -100n, effectiveAt: at,
    });
    await expect(recorder.recordDisputeInTransaction(transaction as never,
      event('charge.dispute.funds_withdrawn', 'needs_response', [movement('txn_withdraw1', -100)]), at))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists only allow-listed operational fields', async () => {
    await recorder.recordDisputeInTransaction(transaction as never,
      event('charge.dispute.funds_withdrawn', 'needs_response', [movement('txn_withdraw1', -100)]), at);
    const written = JSON.stringify([
      transaction.billingDispute.createMany.mock.calls[0],
      transaction.billingDisputeObservation.create.mock.calls[0],
      transaction.billingDisputeEffect.createMany.mock.calls[0],
    ], (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    expect(written).not.toMatch(/customer_email|sensitive@example|synthetic-secret|metadata|evidence|card|prompt|resume/i);
  });
});

describe('Dispute balance transaction selection', () => {
  it('rejects missing, malformed, and ambiguous movement evidence', () => {
    expect(selectDisputeMovement({}, 'charge.dispute.funds_withdrawn')).toBeNull();
    expect(selectDisputeMovement({ balance_transactions: [movement('txn_a', -100), movement('txn_b', -100)] },
      'charge.dispute.funds_withdrawn')).toBeNull();
  });
});

describe('Billing dispute metrics reader', () => {
  const prisma = {
    billingDisputeMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingDailyDisputeMetric: { findMany: jest.fn() },
  };
  const reader = new BillingDisputeMetricsReadService(prisma as never);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.billingDisputeMetricsBoundary.findUniqueOrThrow.mockResolvedValue({ metricsStartAt: boundary, currency: 'usd' });
    prisma.billingDailyDisputeMetric.findMany.mockResolvedValue([{
      day: new Date('2026-10-02T00:00:00.000Z'),
      withdrawnMinor: -6_000n, reinstatedMinor: 4_000n,
      withdrawalCount: 1, reinstatementCount: 1,
    }]);
  });
  it('returns unavailable before the boundary and bounded partial UTC days after it', async () => {
    const unavailable = await reader.getMetrics({ from: new Date('2026-10-01T00:00:00Z'), toExclusive: new Date('2026-10-02T00:00:00Z') });
    expect(unavailable).toEqual(expect.objectContaining({ totals: null, actualCoveredRange: null, daily: [] }));
    expect(prisma.billingDailyDisputeMetric.findMany).not.toHaveBeenCalled();
    const result = await reader.getMetrics({ from: new Date('2026-10-02T00:00:00Z'), toExclusive: new Date('2026-10-03T00:00:00Z') });
    expect(result.totals).toEqual({ withdrawnMinor: -6_000, reinstatedMinor: 4_000, withdrawalCount: 1, reinstatementCount: 1 });
    expect(result.daily[0]?.coverage).toBe('partial');
    expect(prisma.billingDailyDisputeMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 90, select: {
        day: true, withdrawnMinor: true, reinstatedMinor: true,
        withdrawalCount: true, reinstatementCount: true,
      } }),
    );
    await expect(reader.getMetrics({ from: new Date('2026-10-02T00:00:00Z'), toExclusive: new Date('2027-01-02T00:00:00Z') }))
      .rejects.toThrow('Invalid dispute metrics UTC date range');
  });
});

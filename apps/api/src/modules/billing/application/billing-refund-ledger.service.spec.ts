import { BadRequestException } from '@nestjs/common';
import type Stripe from 'stripe';
import { BillingFinancialMetricsRecorderService } from './billing-financial-metrics-recorder.service';
import { BillingRefundMetricsReadService } from './billing-refund-metrics-read.service';

const boundary = new Date('2026-10-02T12:00:00.000Z');
const observedAt = new Date('2026-10-03T00:00:00.000Z');
const makeEvent = (
  status: string,
  options: { id?: string; refundId?: string; amount?: number; currency?: string; at?: Date; type?: string } = {},
) => ({
  id: options.id ?? 'evt_refund_1',
  type: options.type ?? 'refund.updated',
  created: Math.floor((options.at ?? boundary).getTime() / 1000),
  data: { object: {
    object: 'refund',
    id: options.refundId ?? 're_refund1',
    amount: options.amount ?? 1_900,
    currency: options.currency ?? 'usd',
    status,
    created: Math.floor((options.at ?? boundary).getTime() / 1000),
    charge: 'ch_test1',
    payment_intent: 'pi_test1',
    metadata: { password: 'synthetic-secret' },
  } },
}) as unknown as Stripe.Event;

describe('Billing refund ledger recorder', () => {
  const transaction = {
    billingRefund: {
      createMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    billingRefundObservation: { create: jest.fn() },
    billingRefundMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingRefundEffect: { create: jest.fn() },
    billingDailyRefundMetric: { upsert: jest.fn() },
    billingFinancialEvent: { create: jest.fn() },
  };
  const recorder = new BillingFinancialMetricsRecorderService();

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.billingRefund.createMany.mockResolvedValue({ count: 1 });
    transaction.billingRefund.findUniqueOrThrow.mockResolvedValue({
      id: 'local-refund', amountMinor: 1_900n, currency: 'usd', providerCreatedAt: boundary,
    });
    transaction.billingRefund.updateMany.mockResolvedValue({ count: 1 });
    transaction.billingRefundMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: boundary, currency: 'usd',
    });
  });

  it.each(['pending', 'requires_action', 'failed', 'canceled'])(
    'stores %s without a monetary effect', async (status) => {
      await recorder.recordRefundInTransaction(transaction as never, makeEvent(status), observedAt);
      expect(transaction.billingRefundObservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status }),
      });
      expect(transaction.billingRefund.updateMany).not.toHaveBeenCalled();
      expect(transaction.billingRefundEffect.create).not.toHaveBeenCalled();
    },
  );

  it('records the first successful USD observation as one negative boundary-equal effect', async () => {
    await recorder.recordRefundInTransaction(transaction as never, makeEvent('succeeded'), observedAt);
    expect(transaction.billingRefundEffect.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountMinor: -1_900n, effectiveAt: boundary }),
    });
    expect(transaction.billingDailyRefundMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {
        refundAdjustmentMinor: { increment: -1_900n },
        successfulRefundCount: { increment: 1 },
      } }),
    );
    expect(transaction.billingFinancialEvent.create).not.toHaveBeenCalled();
  });

  it('does not create another effect when a different event observes the same succeeded refund', async () => {
    transaction.billingRefund.updateMany.mockResolvedValueOnce({ count: 0 });
    await recorder.recordRefundInTransaction(transaction as never, makeEvent('succeeded', { id: 'evt_second' }), observedAt);
    expect(transaction.billingRefundObservation.create).toHaveBeenCalledTimes(1);
    expect(transaction.billingRefundEffect.create).not.toHaveBeenCalled();
  });

  it('retains non-USD status as unsupported and excludes it from USD effects', async () => {
    transaction.billingRefund.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'local-refund', amountMinor: 1_900n, currency: 'eur', providerCreatedAt: boundary,
    });
    await recorder.recordRefundInTransaction(transaction as never, makeEvent('succeeded', { currency: 'eur' }), observedAt);
    expect(transaction.billingRefund.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ currencySupport: 'unsupported' })],
      skipDuplicates: true,
    });
    expect(transaction.billingRefundEffect.create).not.toHaveBeenCalled();
  });

  it('retains a pre-boundary successful observation without fabricating an effect', async () => {
    const at = new Date(boundary.getTime() - 1_000);
    transaction.billingRefund.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'local-refund', amountMinor: 1_900n, currency: 'usd', providerCreatedAt: at,
    });
    await recorder.recordRefundInTransaction(transaction as never, makeEvent('succeeded', { at }), observedAt);
    expect(transaction.billingRefund.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.billingRefundEffect.create).not.toHaveBeenCalled();
  });

  it('ignores unsupported events and rejects malformed refund status safely', async () => {
    await recorder.recordRefundInTransaction(transaction as never, makeEvent('succeeded', { type: 'charge.refunded' }), observedAt);
    expect(transaction.billingRefund.createMany).not.toHaveBeenCalled();
    await expect(recorder.recordRefundInTransaction(transaction as never, makeEvent('mystery'), observedAt))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.billingRefundObservation.create).not.toHaveBeenCalled();
  });

  it('propagates aggregate failure for transaction rollback without exposing payload metadata', async () => {
    transaction.billingDailyRefundMetric.upsert.mockRejectedValueOnce(new Error('synthetic aggregate failure'));
    await expect(recorder.recordRefundInTransaction(transaction as never, makeEvent('succeeded'), observedAt))
      .rejects.toThrow('synthetic aggregate failure');
    const serialized = JSON.stringify(transaction.billingRefund.createMany.mock.calls[0]?.[0],
      (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    expect(serialized).not.toMatch(/password|synthetic-secret|metadata|customer|invoice|userId|prompt|resume|token/i);
  });
});

describe('Billing refund metrics read boundary', () => {
  const prisma = {
    billingRefundMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingDailyRefundMetric: { findMany: jest.fn() },
  };
  const reader = new BillingRefundMetricsReadService(prisma as never);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.billingRefundMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: boundary, currency: 'usd',
    });
    prisma.billingDailyRefundMetric.findMany.mockResolvedValue([{ day: new Date('2026-10-02T00:00:00Z'), refundAdjustmentMinor: -1_900n, successfulRefundCount: 1 }]);
  });

  it('returns unavailable for entirely pre-boundary periods without a daily query', async () => {
    const result = await reader.getMetrics({ from: new Date('2026-10-01T00:00:00Z'), toExclusive: new Date('2026-10-02T00:00:00Z') });
    expect(result).toEqual(expect.objectContaining({ totals: null, actualCoveredRange: null, daily: [] }));
    expect(prisma.billingDailyRefundMetric.findMany).not.toHaveBeenCalled();
  });

  it('returns a partial boundary day and negative adjustment in a bounded projection', async () => {
    const result = await reader.getMetrics({ from: new Date('2026-10-02T00:00:00Z'), toExclusive: new Date('2026-10-03T00:00:00Z') });
    expect(result.totals).toEqual({ refundAdjustmentMinor: -1_900, successfulRefundCount: 1 });
    expect(result.daily).toEqual([{ day: '2026-10-02', coverage: 'partial', refundAdjustmentMinor: -1_900, successfulRefundCount: 1 }]);
    expect(prisma.billingDailyRefundMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 90, select: { day: true, refundAdjustmentMinor: true, successfulRefundCount: true } }),
    );
    expect(JSON.stringify(result)).not.toMatch(/refundId|charge|paymentIntent|customer|url|secret|token|metadata/i);
  });

  it('rejects ranges over 90 UTC days', async () => {
    await expect(reader.getMetrics({ from: new Date('2026-10-02T00:00:00Z'), toExclusive: new Date('2027-01-02T00:00:00Z') }))
      .rejects.toThrow('Invalid refund metrics UTC date range');
  });
});

import { BadRequestException } from '@nestjs/common';
import { BillingFinancialMetricsRecorderService } from './billing-financial-metrics-recorder.service';

describe('BillingFinancialMetricsRecorderService', () => {
  const boundary = new Date('2026-10-01T12:34:56.000Z');
  const transaction = {
    billingFinancialMetricsBoundary: {
      findUniqueOrThrow: jest.fn(),
    },
    billingFinancialEvent: { create: jest.fn() },
    billingDailyFinancialMetric: { upsert: jest.fn() },
  };
  const service = new BillingFinancialMetricsRecorderService();
  const input = {
    sourceStripeEventId: 'evt_safe_123',
    eventType: 'invoice.payment_succeeded',
    amountMinor: 1_900,
    currency: 'usd',
    effectiveAt: boundary,
    observedAt: new Date('2026-10-01T12:35:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.billingFinancialMetricsBoundary.findUniqueOrThrow.mockResolvedValue(
      { metricsStartAt: boundary, currency: 'usd' },
    );
    transaction.billingFinancialEvent.create.mockResolvedValue({
      id: 'financial-event-1',
      sequence: 1n,
    });
    transaction.billingDailyFinancialMetric.upsert.mockResolvedValue({});
  });

  it('records boundary-equal successful USD revenue and one UTC payment atomically', async () => {
    await expect(
      service.recordSuccessfulInvoiceInTransaction(
        transaction as never,
        input,
      ),
    ).resolves.toEqual({ id: 'financial-event-1', sequence: 1n });
    expect(transaction.billingFinancialEvent.create).toHaveBeenCalledWith({
      data: {
        sourceStripeEventId: 'evt_safe_123',
        category: 'gross_revenue',
        amountMinor: 1_900n,
        currency: 'usd',
        effectiveAt: boundary,
        observedAt: input.observedAt,
      },
      select: { id: true, sequence: true },
    });
    expect(transaction.billingDailyFinancialMetric.upsert).toHaveBeenCalledWith({
      where: {
        day_currency: {
          day: new Date('2026-10-01T00:00:00.000Z'),
          currency: 'usd',
        },
      },
      create: {
        day: new Date('2026-10-01T00:00:00.000Z'),
        currency: 'usd',
        grossRevenueMinor: 1_900n,
        successfulPaymentCount: 1,
      },
      update: {
        grossRevenueMinor: { increment: 1_900n },
        successfulPaymentCount: { increment: 1 },
      },
    });
  });

  it('excludes effective events before metricsStartAt without fabricating data', async () => {
    await expect(
      service.recordSuccessfulInvoiceInTransaction(transaction as never, {
        ...input,
        effectiveAt: new Date(boundary.getTime() - 1),
      }),
    ).resolves.toBeNull();
    expect(transaction.billingFinancialEvent.create).not.toHaveBeenCalled();
    expect(transaction.billingDailyFinancialMetric.upsert).not.toHaveBeenCalled();
  });

  it('rejects non-USD and invalid amounts before any financial write', async () => {
    await expect(
      service.recordSuccessfulInvoiceInTransaction(transaction as never, {
        ...input,
        currency: 'eur',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.recordSuccessfulInvoiceInTransaction(transaction as never, {
        ...input,
        amountMinor: -1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.billingFinancialEvent.create).not.toHaveBeenCalled();
  });

  it('ignores unsupported Stripe event types without reading or writing metrics', async () => {
    await expect(
      service.recordSuccessfulInvoiceInTransaction(transaction as never, {
        ...input,
        eventType: 'invoice.payment_failed',
      }),
    ).resolves.toBeNull();
    expect(
      transaction.billingFinancialMetricsBoundary.findUniqueOrThrow,
    ).not.toHaveBeenCalled();
    expect(transaction.billingFinancialEvent.create).not.toHaveBeenCalled();
  });

  it('propagates aggregate failure so the surrounding webhook transaction rolls back', async () => {
    transaction.billingDailyFinancialMetric.upsert.mockRejectedValueOnce(
      new Error('synthetic aggregate failure'),
    );
    await expect(
      service.recordSuccessfulInvoiceInTransaction(
        transaction as never,
        input,
      ),
    ).rejects.toThrow('synthetic aggregate failure');
    expect(transaction.billingFinancialEvent.create).toHaveBeenCalledTimes(1);
  });

  it('persists no identifiers or content beyond the opaque source event identity', async () => {
    await service.recordSuccessfulInvoiceInTransaction(
      transaction as never,
      input,
    );
    const serialized = JSON.stringify(
      transaction.billingFinancialEvent.create.mock.calls[0]?.[0],
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    );
    expect(serialized).not.toMatch(
      /customer|userId|paymentIntent|invoiceUrl|prompt|resume|cv|token|credential|secret|provider/i,
    );
  });
});

import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  BillingFinancialMetricsReadService,
  MAX_FINANCIAL_METRICS_RANGE_DAYS,
} from './billing-financial-metrics-read.service';

describe('BillingFinancialMetricsReadService', () => {
  const prisma = {
    billingFinancialMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingDailyFinancialMetric: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payment: { findMany: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  let service: BillingFinancialMetricsReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.billingFinancialMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: new Date('2026-10-01T12:34:56.000Z'),
      currency: 'usd',
    });
    prisma.billingDailyFinancialMetric.findMany.mockResolvedValue([
      {
        day: new Date('2026-10-01T00:00:00.000Z'),
        grossRevenueMinor: 1_900n,
        successfulPaymentCount: 1,
      },
      {
        day: new Date('2026-10-02T00:00:00.000Z'),
        grossRevenueMinor: 4_900n,
        successfulPaymentCount: 1,
      },
    ]);
    service = new BillingFinancialMetricsReadService(
      prisma as unknown as PrismaService,
    );
  });

  it('returns bounded future-only UTC totals with a partial boundary day', async () => {
    await expect(
      service.getMetrics({
        from: new Date('2026-10-01T00:00:00.000Z'),
        toExclusive: new Date('2026-10-03T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      metricsStartAt: new Date('2026-10-01T12:34:56.000Z'),
      requestedRangeStartsBeforeMetrics: true,
      actualCoveredRange: {
        from: new Date('2026-10-01T12:34:56.000Z'),
        toExclusive: new Date('2026-10-03T00:00:00.000Z'),
      },
      currency: 'usd',
      totals: {
        grossRevenueMinor: 6_800,
        successfulPaymentCount: 2,
      },
      daily: [
        {
          day: '2026-10-01',
          coverage: 'partial',
          grossRevenueMinor: 1_900,
          successfulPaymentCount: 1,
        },
        {
          day: '2026-10-02',
          coverage: 'complete',
          grossRevenueMinor: 4_900,
          successfulPaymentCount: 1,
        },
      ],
    });
    expect(prisma.billingDailyFinancialMetric.findMany).toHaveBeenCalledWith({
      where: {
        currency: 'usd',
        day: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lt: new Date('2026-10-03T00:00:00.000Z'),
        },
      },
      orderBy: { day: 'asc' },
      select: {
        day: true,
        grossRevenueMinor: true,
        successfulPaymentCount: true,
      },
    });
  });

  it('reports a wholly pre-boundary range as unavailable rather than zero', async () => {
    const result = await service.getMetrics({
      from: new Date('2026-09-01T00:00:00.000Z'),
      toExclusive: new Date('2026-09-02T00:00:00.000Z'),
    });
    expect(result).toEqual({
      metricsStartAt: new Date('2026-10-01T12:34:56.000Z'),
      requestedRangeStartsBeforeMetrics: true,
      actualCoveredRange: null,
      currency: 'usd',
      totals: null,
      daily: [],
    });
    expect(prisma.billingDailyFinancialMetric.findMany).not.toHaveBeenCalled();
  });

  it('zero-fills only covered future days without reading Payment or sensitive tables', async () => {
    prisma.billingDailyFinancialMetric.findMany.mockResolvedValueOnce([]);
    const result = await service.getMetrics({
      from: new Date('2026-10-02T00:00:00.000Z'),
      toExclusive: new Date('2026-10-03T00:00:00.000Z'),
    });
    expect(result.totals).toEqual({
      grossRevenueMinor: 0,
      successfulPaymentCount: 0,
    });
    expect(result.daily).toEqual([
      {
        day: '2026-10-02',
        coverage: 'complete',
        grossRevenueMinor: 0,
        successfulPaymentCount: 0,
      },
    ]);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects non-USD boundary state and invalid or excessive ranges', async () => {
    prisma.billingFinancialMetricsBoundary.findUniqueOrThrow.mockResolvedValueOnce({
      metricsStartAt: new Date('2026-10-01T12:34:56.000Z'),
      currency: 'eur',
    });
    await expect(
      service.getMetrics({
        from: new Date('2026-10-01T00:00:00.000Z'),
        toExclusive: new Date('2026-10-02T00:00:00.000Z'),
      }),
    ).rejects.toThrow('currency is unsupported');
    await expect(
      service.getMetrics({
        from: new Date('2026-01-01T00:00:00.000Z'),
        toExclusive: new Date(
          Date.UTC(2026, 0, 1 + MAX_FINANCIAL_METRICS_RANGE_DAYS + 1),
        ),
      }),
    ).rejects.toThrow('Invalid financial metrics UTC date range');
  });

  it('returns only allow-listed aggregates', async () => {
    const result = await service.getMetrics({
      from: new Date('2026-10-01T00:00:00.000Z'),
      toExclusive: new Date('2026-10-03T00:00:00.000Z'),
    });
    expect(JSON.stringify(result)).not.toMatch(
      /customer|userId|paymentId|stripe|invoice|url|prompt|resume|cv|token|credential|secret|provider/i,
    );
  });
});

import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PLAN_PRICING } from '../domain/plan-pricing';
import { BillingMetricsReadService } from './billing-metrics-read.service';

describe('BillingMetricsReadService', () => {
  const prisma = {
    subscription: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    billingMetricsHistoryBoundary: { findUniqueOrThrow: jest.fn() },
    billingDailySubscriptionMetric: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    payment: { findMany: jest.fn(), update: jest.fn() },
    usageLimit: { findMany: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const clock = { now: () => new Date('2026-09-25T12:00:00.000Z') };
  let service: BillingMetricsReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.subscription.groupBy.mockResolvedValue([]);
    prisma.billingMetricsHistoryBoundary.findUniqueOrThrow.mockResolvedValue({
      historyAvailableFrom: new Date('2026-09-25T12:00:00.000Z'),
      currency: 'usd',
      baselineActivePaidSubscriptions: 2,
      baselineActiveProSubscriptions: 1,
      baselineActivePremiumSubscriptions: 1,
      baselineMonthlyRecurringRevenueMinor:
        PLAN_PRICING.pro.unitAmount + PLAN_PRICING.premium.unitAmount,
    });
    prisma.billingDailySubscriptionMetric.aggregate.mockResolvedValue({
      _sum: {
        activePaidDelta: 0,
        activeProDelta: 0,
        activePremiumDelta: 0,
        monthlyRecurringRevenueDeltaMinor: 0,
      },
    });
    prisma.billingDailySubscriptionMetric.findMany.mockResolvedValue([]);
    service = new BillingMetricsReadService(
      prisma as unknown as PrismaService,
      clock as never,
    );
  });

  it('counts only active paid plans and calculates canonical USD monthly recurring revenue', async () => {
    prisma.subscription.groupBy.mockResolvedValue([
      { plan: SubscriptionPlan.pro, _count: { _all: 3 } },
      { plan: SubscriptionPlan.premium, _count: { _all: 2 } },
    ]);

    await expect(service.getCurrentMetrics()).resolves.toEqual({
      asOf: new Date('2026-09-25T12:00:00.000Z'),
      currency: 'usd',
      activePaidSubscriptions: 5,
      activePaidSubscriptionsByPlan: { pro: 3, premium: 2 },
      monthlyRecurringRevenueMinor:
        3 * PLAN_PRICING.pro.unitAmount +
        2 * PLAN_PRICING.premium.unitAmount,
    });

    expect(prisma.subscription.groupBy).toHaveBeenCalledWith({
      by: ['plan'],
      where: {
        status: SubscriptionStatus.active,
        plan: { in: [SubscriptionPlan.pro, SubscriptionPlan.premium] },
      },
      _count: { _all: true },
    });
  });

  it('returns an explicit zero state without loading subscription rows', async () => {
    await expect(service.getCurrentMetrics()).resolves.toEqual(
      expect.objectContaining({
        activePaidSubscriptions: 0,
        activePaidSubscriptionsByPlan: { pro: 0, premium: 0 },
        monthlyRecurringRevenueMinor: 0,
      }),
    );
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });

  it('uses one aggregate query, performs no writes, and exposes no billing identifiers', async () => {
    const result = await service.getCurrentMetrics();

    expect(prisma.subscription.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.usageLimit.findMany).not.toHaveBeenCalled();
    expect(prisma.usageLimit.update).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /stripe|invoice|customer|payment|token|credential|secret|email|userId/i,
    );
  });

  it('reports pre-migration history as unavailable instead of fabricated zeroes', async () => {
    await expect(
      service.getHistoricalMetrics({
        from: new Date('2026-09-20T00:00:00.000Z'),
        toExclusive: new Date('2026-09-22T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      historyAvailableFrom: new Date('2026-09-25T12:00:00.000Z'),
      requestedRangeStartsBeforeHistory: true,
      actualCoveredRange: null,
      totals: null,
      daily: [],
    });
    expect(prisma.billingDailySubscriptionMetric.findMany).not.toHaveBeenCalled();
  });

  it('reconstructs daily historical MRR, movements, and churn from the migration baseline', async () => {
    prisma.billingDailySubscriptionMetric.findMany.mockResolvedValue([
      {
        day: new Date('2026-09-25T00:00:00.000Z'),
        activePaidDelta: 1,
        activeProDelta: 1,
        activePremiumDelta: 0,
        monthlyRecurringRevenueDeltaMinor: PLAN_PRICING.pro.unitAmount,
        newPaidSubscriptions: 1,
        expansionMrrMinor: 0,
        contractionMrrMinor: 0,
        churnCount: 0,
        churnedMrrMinor: 0,
        reactivationCount: 0,
      },
      {
        day: new Date('2026-09-26T00:00:00.000Z'),
        activePaidDelta: -1,
        activeProDelta: 0,
        activePremiumDelta: -1,
        monthlyRecurringRevenueDeltaMinor: -PLAN_PRICING.premium.unitAmount,
        newPaidSubscriptions: 0,
        expansionMrrMinor: 0,
        contractionMrrMinor: 0,
        churnCount: 1,
        churnedMrrMinor: PLAN_PRICING.premium.unitAmount,
        reactivationCount: 0,
      },
    ]);

    const result = await service.getHistoricalMetrics({
      from: new Date('2026-09-20T00:00:00.000Z'),
      toExclusive: new Date('2026-09-27T00:00:00.000Z'),
    });

    expect(result).toEqual({
      historyAvailableFrom: new Date('2026-09-25T12:00:00.000Z'),
      requestedRangeStartsBeforeHistory: true,
      actualCoveredRange: {
        from: new Date('2026-09-25T12:00:00.000Z'),
        toExclusive: new Date('2026-09-27T00:00:00.000Z'),
      },
      totals: {
        newPaidSubscriptions: 1,
        expansionMrrMinor: 0,
        contractionMrrMinor: 0,
        churnCount: 1,
        churnedMrrMinor: PLAN_PRICING.premium.unitAmount,
        reactivationCount: 0,
      },
      daily: [
        expect.objectContaining({
          day: '2026-09-25',
          coverage: 'partial',
          activePaidSubscriptions: 3,
          activePaidSubscriptionsByPlan: { pro: 2, premium: 1 },
          monthlyRecurringRevenueMinor:
            2 * PLAN_PRICING.pro.unitAmount +
            PLAN_PRICING.premium.unitAmount,
          newPaidSubscriptions: 1,
        }),
        expect.objectContaining({
          day: '2026-09-26',
          coverage: 'complete',
          activePaidSubscriptions: 2,
          activePaidSubscriptionsByPlan: { pro: 2, premium: 0 },
          monthlyRecurringRevenueMinor: 2 * PLAN_PRICING.pro.unitAmount,
          churnCount: 1,
          churnedMrrMinor: PLAN_PRICING.premium.unitAmount,
        }),
      ],
    });
  });

  it('includes preceding bounded deltas when a requested range starts after the boundary', async () => {
    prisma.billingDailySubscriptionMetric.aggregate.mockResolvedValue({
      _sum: {
        activePaidDelta: 1,
        activeProDelta: 1,
        activePremiumDelta: 0,
        monthlyRecurringRevenueDeltaMinor: PLAN_PRICING.pro.unitAmount,
      },
    });

    const result = await service.getHistoricalMetrics({
      from: new Date('2026-09-27T00:00:00.000Z'),
      toExclusive: new Date('2026-09-28T00:00:00.000Z'),
    });

    expect(result.daily).toEqual([
      expect.objectContaining({
        day: '2026-09-27',
        activePaidSubscriptions: 3,
        activePaidSubscriptionsByPlan: { pro: 2, premium: 1 },
      }),
    ]);
    expect(prisma.billingDailySubscriptionMetric.aggregate).toHaveBeenCalledWith({
      where: {
        currency: 'usd',
        day: {
          gte: new Date('2026-09-25T00:00:00.000Z'),
          lt: new Date('2026-09-27T00:00:00.000Z'),
        },
      },
      _sum: {
        activePaidDelta: true,
        activeProDelta: true,
        activePremiumDelta: true,
        monthlyRecurringRevenueDeltaMinor: true,
      },
    });
  });

  it.each([
    [new Date('2026-09-25T12:00:00.000Z'), new Date('2026-09-26T00:00:00.000Z')],
    [new Date('2026-09-25T00:00:00.000Z'), new Date('2026-09-25T00:00:00.000Z')],
    [new Date('2026-01-01T00:00:00.000Z'), new Date('2026-04-02T00:00:00.000Z')],
  ])('rejects non-UTC-day, empty, or excessive historical ranges', async (from, toExclusive) => {
    await expect(
      service.getHistoricalMetrics({ from, toExclusive }),
    ).rejects.toThrow('Invalid Billing metrics UTC date range');
    expect(
      prisma.billingMetricsHistoryBoundary.findUniqueOrThrow,
    ).not.toHaveBeenCalled();
  });
});

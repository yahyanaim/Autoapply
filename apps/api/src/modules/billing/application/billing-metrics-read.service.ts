import { Injectable, Optional } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';
import { PLAN_PRICING, PurchasablePlan } from '../domain/plan-pricing';
import { BILLING_HISTORY_BOUNDARY_ID } from './subscription-lifecycle.service';

const DAY_MS = 24 * 60 * 60 * 1_000;
export const MAX_BILLING_METRICS_RANGE_DAYS = 90;

export interface BillingMetricsSnapshot {
  asOf: Date;
  currency: 'usd';
  activePaidSubscriptions: number;
  activePaidSubscriptionsByPlan: Record<PurchasablePlan, number>;
  monthlyRecurringRevenueMinor: number;
}

export interface BillingHistoricalMetricDay {
  day: string;
  coverage: 'complete' | 'partial';
  activePaidSubscriptions: number;
  activePaidSubscriptionsByPlan: Record<PurchasablePlan, number>;
  monthlyRecurringRevenueMinor: number;
  newPaidSubscriptions: number;
  expansionMrrMinor: number;
  contractionMrrMinor: number;
  churnCount: number;
  churnedMrrMinor: number;
  reactivationCount: number;
}

@Injectable()
export class BillingMetricsReadService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async getCurrentMetrics(): Promise<BillingMetricsSnapshot> {
    const groups = await this.prisma.subscription.groupBy({
      by: ['plan'],
      where: {
        status: SubscriptionStatus.active,
        plan: { in: [SubscriptionPlan.pro, SubscriptionPlan.premium] },
      },
      _count: { _all: true },
    });

    const activePaidSubscriptionsByPlan: Record<PurchasablePlan, number> = {
      pro: 0,
      premium: 0,
    };
    for (const group of groups) {
      if (
        group.plan === SubscriptionPlan.pro ||
        group.plan === SubscriptionPlan.premium
      ) {
        activePaidSubscriptionsByPlan[group.plan] = group._count._all;
      }
    }

    const activePaidSubscriptions =
      activePaidSubscriptionsByPlan.pro +
      activePaidSubscriptionsByPlan.premium;
    const monthlyRecurringRevenueMinor =
      activePaidSubscriptionsByPlan.pro * PLAN_PRICING.pro.unitAmount +
      activePaidSubscriptionsByPlan.premium *
        PLAN_PRICING.premium.unitAmount;

    return {
      asOf: this.clock.now(),
      currency: 'usd',
      activePaidSubscriptions,
      activePaidSubscriptionsByPlan,
      monthlyRecurringRevenueMinor,
    };
  }

  async getHistoricalMetrics(input: { from: Date; toExclusive: Date }) {
    this.assertRange(input.from, input.toExclusive);
    const boundary =
      await this.prisma.billingMetricsHistoryBoundary.findUniqueOrThrow({
        where: { id: BILLING_HISTORY_BOUNDARY_ID },
        select: {
          historyAvailableFrom: true,
          currency: true,
          baselineActivePaidSubscriptions: true,
          baselineActiveProSubscriptions: true,
          baselineActivePremiumSubscriptions: true,
          baselineMonthlyRecurringRevenueMinor: true,
        },
      });
    if (boundary.currency !== 'usd') {
      throw new Error('Billing metrics history currency is unsupported');
    }

    const startsBeforeHistory = input.from < boundary.historyAvailableFrom;
    if (input.toExclusive <= boundary.historyAvailableFrom) {
      return {
        historyAvailableFrom: boundary.historyAvailableFrom,
        requestedRangeStartsBeforeHistory: true,
        actualCoveredRange: null,
        totals: null,
        daily: [] as BillingHistoricalMetricDay[],
      };
    }

    const boundaryDay = this.utcDay(boundary.historyAvailableFrom);
    const firstDay = input.from > boundaryDay ? input.from : boundaryDay;
    const preceding =
      firstDay > boundaryDay
        ? await this.prisma.billingDailySubscriptionMetric.aggregate({
            where: {
              currency: 'usd',
              day: { gte: boundaryDay, lt: firstDay },
            },
            _sum: {
              activePaidDelta: true,
              activeProDelta: true,
              activePremiumDelta: true,
              monthlyRecurringRevenueDeltaMinor: true,
            },
          })
        : { _sum: {} };
    const rows = await this.prisma.billingDailySubscriptionMetric.findMany({
      where: {
        currency: 'usd',
        day: { gte: firstDay, lt: input.toExclusive },
      },
      orderBy: { day: 'asc' },
      select: {
        day: true,
        activePaidDelta: true,
        activeProDelta: true,
        activePremiumDelta: true,
        monthlyRecurringRevenueDeltaMinor: true,
        newPaidSubscriptions: true,
        expansionMrrMinor: true,
        contractionMrrMinor: true,
        churnCount: true,
        churnedMrrMinor: true,
        reactivationCount: true,
      },
    });
    const byDay = new Map(rows.map((row) => [row.day.toISOString(), row]));
    const sums = preceding._sum as {
      activePaidDelta?: number | null;
      activeProDelta?: number | null;
      activePremiumDelta?: number | null;
      monthlyRecurringRevenueDeltaMinor?: number | null;
    };
    let activePaid =
      boundary.baselineActivePaidSubscriptions +
      (sums.activePaidDelta ?? 0);
    let activePro =
      boundary.baselineActiveProSubscriptions + (sums.activeProDelta ?? 0);
    let activePremium =
      boundary.baselineActivePremiumSubscriptions +
      (sums.activePremiumDelta ?? 0);
    let mrr =
      boundary.baselineMonthlyRecurringRevenueMinor +
      (sums.monthlyRecurringRevenueDeltaMinor ?? 0);
    const totals = {
      newPaidSubscriptions: 0,
      expansionMrrMinor: 0,
      contractionMrrMinor: 0,
      churnCount: 0,
      churnedMrrMinor: 0,
      reactivationCount: 0,
    };
    const daily: BillingHistoricalMetricDay[] = [];

    for (
      let timestamp = firstDay.getTime();
      timestamp < input.toExclusive.getTime();
      timestamp += DAY_MS
    ) {
      const day = new Date(timestamp);
      const row = byDay.get(day.toISOString());
      activePaid += row?.activePaidDelta ?? 0;
      activePro += row?.activeProDelta ?? 0;
      activePremium += row?.activePremiumDelta ?? 0;
      mrr += row?.monthlyRecurringRevenueDeltaMinor ?? 0;
      totals.newPaidSubscriptions += row?.newPaidSubscriptions ?? 0;
      totals.expansionMrrMinor += row?.expansionMrrMinor ?? 0;
      totals.contractionMrrMinor += row?.contractionMrrMinor ?? 0;
      totals.churnCount += row?.churnCount ?? 0;
      totals.churnedMrrMinor += row?.churnedMrrMinor ?? 0;
      totals.reactivationCount += row?.reactivationCount ?? 0;
      daily.push({
        day: day.toISOString().slice(0, 10),
        coverage:
          day.getTime() === boundaryDay.getTime() &&
          boundary.historyAvailableFrom.getTime() !== boundaryDay.getTime()
            ? 'partial'
            : 'complete',
        activePaidSubscriptions: activePaid,
        activePaidSubscriptionsByPlan: {
          pro: activePro,
          premium: activePremium,
        },
        monthlyRecurringRevenueMinor: mrr,
        newPaidSubscriptions: row?.newPaidSubscriptions ?? 0,
        expansionMrrMinor: row?.expansionMrrMinor ?? 0,
        contractionMrrMinor: row?.contractionMrrMinor ?? 0,
        churnCount: row?.churnCount ?? 0,
        churnedMrrMinor: row?.churnedMrrMinor ?? 0,
        reactivationCount: row?.reactivationCount ?? 0,
      });
    }

    return {
      historyAvailableFrom: boundary.historyAvailableFrom,
      requestedRangeStartsBeforeHistory: startsBeforeHistory,
      actualCoveredRange: {
        from:
          input.from > boundary.historyAvailableFrom
            ? input.from
            : boundary.historyAvailableFrom,
        toExclusive: input.toExclusive,
      },
      totals,
      daily,
    };
  }

  private assertRange(from: Date, toExclusive: Date): void {
    const rangeMs = toExclusive.getTime() - from.getTime();
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(toExclusive.getTime()) ||
      from.getUTCHours() !== 0 ||
      from.getUTCMinutes() !== 0 ||
      from.getUTCSeconds() !== 0 ||
      from.getUTCMilliseconds() !== 0 ||
      toExclusive.getUTCHours() !== 0 ||
      toExclusive.getUTCMinutes() !== 0 ||
      toExclusive.getUTCSeconds() !== 0 ||
      toExclusive.getUTCMilliseconds() !== 0 ||
      rangeMs <= 0 ||
      rangeMs > MAX_BILLING_METRICS_RANGE_DAYS * DAY_MS
    ) {
      throw new Error('Invalid Billing metrics UTC date range');
    }
  }

  private utcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}

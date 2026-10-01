import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BILLING_FINANCIAL_METRICS_BOUNDARY_ID } from './billing-financial-metrics-recorder.service';

const DAY_MS = 24 * 60 * 60 * 1_000;
export const MAX_FINANCIAL_METRICS_RANGE_DAYS = 90;

export interface BillingFinancialMetricDay {
  day: string;
  coverage: 'complete' | 'partial';
  grossRevenueMinor: number;
  successfulPaymentCount: number;
}

@Injectable()
export class BillingFinancialMetricsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(input: { from: Date; toExclusive: Date }) {
    this.assertRange(input.from, input.toExclusive);
    const boundary =
      await this.prisma.billingFinancialMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID },
        select: { metricsStartAt: true, currency: true },
      });
    if (boundary.currency !== 'usd') {
      throw new Error('Financial metrics boundary currency is unsupported');
    }

    const requestedRangeStartsBeforeMetrics =
      input.from < boundary.metricsStartAt;
    if (input.toExclusive <= boundary.metricsStartAt) {
      return {
        metricsStartAt: boundary.metricsStartAt,
        requestedRangeStartsBeforeMetrics: true,
        actualCoveredRange: null,
        currency: 'usd' as const,
        totals: null,
        daily: [] as BillingFinancialMetricDay[],
      };
    }

    const boundaryDay = this.utcDay(boundary.metricsStartAt);
    const firstDay = input.from > boundaryDay ? input.from : boundaryDay;
    const rows = await this.prisma.billingDailyFinancialMetric.findMany({
      where: {
        currency: 'usd',
        day: { gte: firstDay, lt: input.toExclusive },
      },
      orderBy: { day: 'asc' },
      select: {
        day: true,
        grossRevenueMinor: true,
        successfulPaymentCount: true,
      },
    });
    const byDay = new Map(rows.map((row) => [row.day.toISOString(), row]));
    const totals = { grossRevenueMinor: 0, successfulPaymentCount: 0 };
    const daily: BillingFinancialMetricDay[] = [];
    for (
      let timestamp = firstDay.getTime();
      timestamp < input.toExclusive.getTime();
      timestamp += DAY_MS
    ) {
      const day = new Date(timestamp);
      const row = byDay.get(day.toISOString());
      const grossRevenueMinor = this.safeNumber(
        row?.grossRevenueMinor ?? 0n,
      );
      const successfulPaymentCount = row?.successfulPaymentCount ?? 0;
      totals.grossRevenueMinor += grossRevenueMinor;
      totals.successfulPaymentCount += successfulPaymentCount;
      daily.push({
        day: day.toISOString().slice(0, 10),
        coverage:
          day.getTime() === boundaryDay.getTime() &&
          boundary.metricsStartAt.getTime() !== boundaryDay.getTime()
            ? 'partial'
            : 'complete',
        grossRevenueMinor,
        successfulPaymentCount,
      });
    }

    if (!Number.isSafeInteger(totals.grossRevenueMinor)) {
      throw new Error('Financial metrics total exceeds safe response range');
    }
    return {
      metricsStartAt: boundary.metricsStartAt,
      requestedRangeStartsBeforeMetrics,
      actualCoveredRange: {
        from:
          input.from > boundary.metricsStartAt
            ? input.from
            : boundary.metricsStartAt,
        toExclusive: input.toExclusive,
      },
      currency: 'usd' as const,
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
      rangeMs > MAX_FINANCIAL_METRICS_RANGE_DAYS * DAY_MS
    ) {
      throw new Error('Invalid financial metrics UTC date range');
    }
  }

  private safeNumber(value: bigint): number {
    const result = Number(value);
    if (!Number.isSafeInteger(result)) {
      throw new Error('Financial metric exceeds safe response range');
    }
    return result;
  }

  private utcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}

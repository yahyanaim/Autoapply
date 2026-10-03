import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BILLING_DISPUTE_METRICS_BOUNDARY_ID } from './billing-financial-metrics-recorder.service';

const DAY_MS = 86_400_000;
export const MAX_DISPUTE_METRICS_RANGE_DAYS = 90;

@Injectable()
export class BillingDisputeMetricsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(input: { from: Date; toExclusive: Date }) {
    const { from, toExclusive } = input;
    const rangeMs = toExclusive.getTime() - from.getTime();
    if (!Number.isFinite(rangeMs) || rangeMs <= 0 ||
      rangeMs > MAX_DISPUTE_METRICS_RANGE_DAYS * DAY_MS ||
      from.getTime() % DAY_MS !== 0 || toExclusive.getTime() % DAY_MS !== 0) {
      throw new Error('Invalid dispute metrics UTC date range');
    }
    const boundary = await this.prisma.billingDisputeMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_DISPUTE_METRICS_BOUNDARY_ID },
      select: { metricsStartAt: true, currency: true },
    });
    if (boundary.currency !== 'usd') {
      throw new Error('Dispute metrics boundary currency is unsupported');
    }
    if (toExclusive <= boundary.metricsStartAt) {
      return {
        metricsStartAt: boundary.metricsStartAt,
        requestedRangeStartsBeforeMetrics: true,
        actualCoveredRange: null,
        currency: 'usd' as const,
        totals: null,
        daily: [],
      };
    }
    const boundaryDay = new Date(Date.UTC(
      boundary.metricsStartAt.getUTCFullYear(),
      boundary.metricsStartAt.getUTCMonth(),
      boundary.metricsStartAt.getUTCDate(),
    ));
    const firstDay = from > boundaryDay ? from : boundaryDay;
    const rows = await this.prisma.billingDailyDisputeMetric.findMany({
      where: { currency: 'usd', day: { gte: firstDay, lt: toExclusive } },
      orderBy: { day: 'asc' },
      take: MAX_DISPUTE_METRICS_RANGE_DAYS,
      select: {
        day: true, withdrawnMinor: true, reinstatedMinor: true,
        withdrawalCount: true, reinstatementCount: true,
      },
    });
    const byDay = new Map(rows.map((row) => [row.day.getTime(), row]));
    const totals = {
      withdrawnMinor: 0, reinstatedMinor: 0,
      withdrawalCount: 0, reinstatementCount: 0,
    };
    const daily = [] as Array<typeof totals & { day: string; coverage: 'partial' | 'complete' }>;
    for (let at = firstDay.getTime(); at < toExclusive.getTime(); at += DAY_MS) {
      const row = byDay.get(at);
      const values = {
        withdrawnMinor: this.safeNumber(row?.withdrawnMinor ?? 0n),
        reinstatedMinor: this.safeNumber(row?.reinstatedMinor ?? 0n),
        withdrawalCount: row?.withdrawalCount ?? 0,
        reinstatementCount: row?.reinstatementCount ?? 0,
      };
      for (const key of Object.keys(values) as Array<keyof typeof values>) {
        totals[key] += values[key];
        if (!Number.isSafeInteger(totals[key])) {
          throw new Error('Dispute metrics total exceeds safe response range');
        }
      }
      daily.push({
        day: new Date(at).toISOString().slice(0, 10),
        coverage: at === boundaryDay.getTime() &&
          boundary.metricsStartAt.getTime() !== boundaryDay.getTime()
          ? 'partial' : 'complete',
        ...values,
      });
    }
    return {
      metricsStartAt: boundary.metricsStartAt,
      requestedRangeStartsBeforeMetrics: from < boundary.metricsStartAt,
      actualCoveredRange: {
        from: from > boundary.metricsStartAt ? from : boundary.metricsStartAt,
        toExclusive,
      },
      currency: 'usd' as const,
      totals,
      daily,
    };
  }

  private safeNumber(value: bigint): number {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) {
      throw new Error('Dispute metric exceeds safe response range');
    }
    return number;
  }
}

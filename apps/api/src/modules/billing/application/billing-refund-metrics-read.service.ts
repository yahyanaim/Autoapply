import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BILLING_REFUND_METRICS_BOUNDARY_ID } from './billing-financial-metrics-recorder.service';

const DAY_MS = 24 * 60 * 60 * 1_000;
export const MAX_REFUND_METRICS_RANGE_DAYS = 90;

@Injectable()
export class BillingRefundMetricsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(input: { from: Date; toExclusive: Date }) {
    const { from, toExclusive } = input;
    const rangeMs = toExclusive.getTime() - from.getTime();
    if (
      !Number.isFinite(rangeMs) || rangeMs <= 0 ||
      rangeMs > MAX_REFUND_METRICS_RANGE_DAYS * DAY_MS ||
      from.getTime() % DAY_MS !== 0 ||
      toExclusive.getTime() % DAY_MS !== 0
    ) {
      throw new Error('Invalid refund metrics UTC date range');
    }
    const boundary = await this.prisma.billingRefundMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_REFUND_METRICS_BOUNDARY_ID },
      select: { metricsStartAt: true, currency: true },
    });
    if (boundary.currency !== 'usd') {
      throw new Error('Refund metrics boundary currency is unsupported');
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

    const boundaryDay = new Date(
      Date.UTC(
        boundary.metricsStartAt.getUTCFullYear(),
        boundary.metricsStartAt.getUTCMonth(),
        boundary.metricsStartAt.getUTCDate(),
      ),
    );
    const firstDay = from > boundaryDay ? from : boundaryDay;
    const rows = await this.prisma.billingDailyRefundMetric.findMany({
      where: { currency: 'usd', day: { gte: firstDay, lt: toExclusive } },
      orderBy: { day: 'asc' },
      take: MAX_REFUND_METRICS_RANGE_DAYS,
      select: { day: true, refundAdjustmentMinor: true, successfulRefundCount: true },
    });
    const byDay = new Map(rows.map((row) => [row.day.getTime(), row]));
    const daily = [] as Array<{
      day: string;
      coverage: 'complete' | 'partial';
      refundAdjustmentMinor: number;
      successfulRefundCount: number;
    }>;
    const totals = { refundAdjustmentMinor: 0, successfulRefundCount: 0 };
    for (let at = firstDay.getTime(); at < toExclusive.getTime(); at += DAY_MS) {
      const row = byDay.get(at);
      const refundAdjustmentMinor = Number(row?.refundAdjustmentMinor ?? 0n);
      if (!Number.isSafeInteger(refundAdjustmentMinor)) {
        throw new Error('Refund metric exceeds safe response range');
      }
      const successfulRefundCount = row?.successfulRefundCount ?? 0;
      totals.refundAdjustmentMinor += refundAdjustmentMinor;
      totals.successfulRefundCount += successfulRefundCount;
      daily.push({
        day: new Date(at).toISOString().slice(0, 10),
        coverage:
          at === boundaryDay.getTime() &&
          boundary.metricsStartAt.getTime() !== boundaryDay.getTime()
            ? 'partial'
            : 'complete',
        refundAdjustmentMinor,
        successfulRefundCount,
      });
    }
    if (!Number.isSafeInteger(totals.refundAdjustmentMinor) ||
      !Number.isSafeInteger(totals.successfulRefundCount)) {
      throw new Error('Refund metrics total exceeds safe response range');
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
}

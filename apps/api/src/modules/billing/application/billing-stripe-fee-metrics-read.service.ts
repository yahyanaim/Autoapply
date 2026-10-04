import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BILLING_STRIPE_FEE_BOUNDARY_ID } from './billing-stripe-fee.service';

const DAY_MS = 86_400_000;
const MAX_DAYS = 90;

@Injectable()
export class BillingStripeFeeMetricsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(input: { from: Date; toExclusive: Date }) {
    const { from, toExclusive } = input;
    const length = toExclusive.getTime() - from.getTime();
    if (!Number.isFinite(length) || length <= 0 || length > MAX_DAYS * DAY_MS ||
      from.getTime() % DAY_MS !== 0 || toExclusive.getTime() % DAY_MS !== 0) {
      throw new Error('Invalid Stripe fee metrics UTC date range');
    }
    const boundary = await this.prisma.billingStripeFeeMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_STRIPE_FEE_BOUNDARY_ID },
      select: { metricsStartAt: true, currency: true },
    });
    if (boundary.currency !== 'usd') throw new Error('Fee metrics boundary currency is unsupported');
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
    const boundaryDay = new Date(Date.UTC(boundary.metricsStartAt.getUTCFullYear(),
      boundary.metricsStartAt.getUTCMonth(), boundary.metricsStartAt.getUTCDate()));
    const firstDay = from > boundaryDay ? from : boundaryDay;
    const rows = await this.prisma.billingDailyStripeFeeMetric.findMany({
      where: { currency: 'usd', day: { gte: firstDay, lt: toExclusive } },
      orderBy: { day: 'asc' },
      take: MAX_DAYS,
      select: { day: true, feeMinor: true, feeEffectCount: true },
    });
    const byDay = new Map(rows.map((row) => [row.day.getTime(), row]));
    const totals = { feeMinor: 0, feeEffectCount: 0 };
    const daily: Array<typeof totals & { day: string; coverage: 'partial' | 'complete' }> = [];
    for (let at = firstDay.getTime(); at < toExclusive.getTime(); at += DAY_MS) {
      const row = byDay.get(at);
      const feeMinor = Number(row?.feeMinor ?? 0n);
      const feeEffectCount = row?.feeEffectCount ?? 0;
      if (!Number.isSafeInteger(feeMinor) || !Number.isSafeInteger(feeEffectCount)) {
        throw new Error('Stripe fee metric exceeds safe response range');
      }
      totals.feeMinor += feeMinor;
      totals.feeEffectCount += feeEffectCount;
      if (!Number.isSafeInteger(totals.feeMinor) || !Number.isSafeInteger(totals.feeEffectCount)) {
        throw new Error('Stripe fee total exceeds safe response range');
      }
      daily.push({
        day: new Date(at).toISOString().slice(0, 10),
        coverage: at === boundaryDay.getTime() && boundary.metricsStartAt.getTime() !== at
          ? 'partial' : 'complete',
        feeMinor,
        feeEffectCount,
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
}

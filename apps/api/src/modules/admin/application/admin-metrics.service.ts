import { BadRequestException, Injectable } from '@nestjs/common';
import { AiMetricsReadService } from '../../ai/application/ai-metrics-read.service';
import { BillingMetricsReadService } from '../../billing/application/billing-metrics-read.service';

const DAY_MS = 24 * 60 * 60 * 1_000;
export const MAX_ADMIN_METRICS_RANGE_DAYS = 90;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class AdminMetricsService {
  constructor(
    private readonly billing: BillingMetricsReadService,
    private readonly ai: AiMetricsReadService,
  ) {}

  async getMetrics(input: { from: string; to: string }) {
    const from = this.parseUtcDay(input.from);
    const to = this.parseUtcDay(input.to);
    const toExclusive = new Date(to.getTime() + DAY_MS);
    const dayCount = (toExclusive.getTime() - from.getTime()) / DAY_MS;
    if (
      from > to ||
      dayCount < 1 ||
      dayCount > MAX_ADMIN_METRICS_RANGE_DAYS
    ) {
      throw new BadRequestException('Invalid metrics UTC date range');
    }

    const [billing, billingHistory, ai] = await Promise.all([
      this.billing.getCurrentMetrics(),
      this.billing.getHistoricalMetrics({ from, toExclusive }),
      this.ai.getEstimatedCostMetrics({ from, toExclusive }),
    ]);

    return {
      period: {
        from: input.from,
        to: input.to,
        timeZone: 'UTC' as const,
        maximumDays: MAX_ADMIN_METRICS_RANGE_DAYS,
      },
      billing: {
        ...billing,
        asOf: billing.asOf.toISOString(),
        history: {
          historyAvailableFrom:
            billingHistory.historyAvailableFrom.toISOString(),
          requestedRangeStartsBeforeHistory:
            billingHistory.requestedRangeStartsBeforeHistory,
          actualCoveredRange: billingHistory.actualCoveredRange
            ? {
                from: billingHistory.actualCoveredRange.from.toISOString(),
                toExclusive:
                  billingHistory.actualCoveredRange.toExclusive.toISOString(),
              }
            : null,
          totals: billingHistory.totals,
          daily: billingHistory.daily,
        },
      },
      ai,
    };
  }

  private parseUtcDay(value: string): Date {
    if (!UTC_DAY.test(value)) {
      throw new BadRequestException('Invalid metrics UTC date range');
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('Invalid metrics UTC date range');
    }
    return date;
  }
}

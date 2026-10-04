import { BadRequestException, Injectable } from '@nestjs/common';
import { AiMetricsReadService } from '../../ai/application/ai-metrics-read.service';
import { BillingMetricsReadService } from '../../billing/application/billing-metrics-read.service';
import { BillingFinancialMetricsReadService } from '../../billing/application/billing-financial-metrics-read.service';
import { BillingStripeFeeMetricsReadService } from '../../billing/application/billing-stripe-fee-metrics-read.service';

const DAY_MS = 24 * 60 * 60 * 1_000;
export const MAX_ADMIN_METRICS_RANGE_DAYS = 90;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class AdminMetricsService {
  constructor(
    private readonly billing: BillingMetricsReadService,
    private readonly financials: BillingFinancialMetricsReadService,
    private readonly ai: AiMetricsReadService,
    private readonly stripeFees: BillingStripeFeeMetricsReadService,
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

    const [billing, billingHistory, ai, financials, stripeFees] = await Promise.all([
      this.billing.getCurrentMetrics(),
      this.billing.getHistoricalMetrics({ from, toExclusive }),
      this.ai.getEstimatedCostMetrics({ from, toExclusive }),
      this.financials.getMetrics({ from, toExclusive }),
      this.stripeFees.getMetrics({ from, toExclusive }),
    ]);
    const financialAi = financials.actualCoveredRange
      ? await this.ai.getEstimatedCostMetricsForFinancialWindow(
          financials.actualCoveredRange,
        )
      : null;
    const aiByDay = new Map(
      financialAi?.daily.map((entry) => [entry.day, entry]) ?? [],
    );

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
      financials: {
        metricsStartAt: financials.metricsStartAt.toISOString(),
        requestedRangeStartsBeforeMetrics:
          financials.requestedRangeStartsBeforeMetrics,
        actualCoveredRange: financials.actualCoveredRange
          ? {
              from: financials.actualCoveredRange.from.toISOString(),
              toExclusive:
                financials.actualCoveredRange.toExclusive.toISOString(),
            }
          : null,
        currency: financials.currency,
        totals:
          financials.totals && financialAi
            ? {
                ...financials.totals,
                estimatedAiCostUsd: financialAi.estimatedCostUsd,
                costedRequestCount: financialAi.costedRequestCount,
              }
            : null,
        daily: financials.daily.map((entry) => {
          const aiDay = aiByDay.get(entry.day);
          return {
            ...entry,
            estimatedAiCostUsd: aiDay?.estimatedCostUsd ?? 0,
            costedRequestCount: aiDay?.costedRequestCount ?? 0,
          };
        }),
      },
      stripeFees: {
        metricsStartAt: stripeFees.metricsStartAt.toISOString(),
        requestedRangeStartsBeforeMetrics: stripeFees.requestedRangeStartsBeforeMetrics,
        actualCoveredRange: stripeFees.actualCoveredRange
          ? {
              from: stripeFees.actualCoveredRange.from.toISOString(),
              toExclusive: stripeFees.actualCoveredRange.toExclusive.toISOString(),
            }
          : null,
        currency: stripeFees.currency,
        totals: stripeFees.totals
          ? {
              feeMinor: stripeFees.totals.feeMinor,
              feeEffectCount: stripeFees.totals.feeEffectCount,
            }
          : null,
        daily: stripeFees.daily.map((entry) => ({
          day: entry.day,
          coverage: entry.coverage,
          feeMinor: entry.feeMinor,
          feeEffectCount: entry.feeEffectCount,
        })),
      },
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

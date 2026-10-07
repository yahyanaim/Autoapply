import { Injectable } from '@nestjs/common';
import {
  BillingDisputeMovementKind,
  BillingEvidenceState,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  BILLING_FINANCIAL_METRICS_BOUNDARY_ID,
  BILLING_REFUND_METRICS_BOUNDARY_ID,
  BILLING_DISPUTE_METRICS_BOUNDARY_ID,
} from './billing-financial-metrics-recorder.service';
import { BILLING_STRIPE_FEE_BOUNDARY_ID } from './billing-stripe-fee.service';
import { BILLING_COMBINED_BOUNDARY_ID } from './billing-financial-completeness.service';

const DAY_MS = 86_400_000;
const MAX_DAYS = 90;

export interface RecordedFinancialDay {
  day: string;
  coverage: 'complete' | 'partial';
  grossRevenueMinor: bigint;
  refundAdjustmentMinor: bigint;
  disputeWithdrawalMinor: bigint;
  disputeReinstatementMinor: bigint;
  stripeFeeMinor: bigint;
  recordedNetRevenueMinor: bigint;
}

function utcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function later(...dates: Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

@Injectable()
export class BillingRecordedNetRevenueService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoundary() {
    const [gross, refund, dispute, fee, combined] = await Promise.all([
      this.prisma.billingFinancialMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID },
        select: { metricsStartAt: true, currency: true },
      }),
      this.prisma.billingRefundMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_REFUND_METRICS_BOUNDARY_ID },
        select: { metricsStartAt: true, currency: true },
      }),
      this.prisma.billingDisputeMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_DISPUTE_METRICS_BOUNDARY_ID },
        select: { metricsStartAt: true, currency: true },
      }),
      this.prisma.billingStripeFeeMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_STRIPE_FEE_BOUNDARY_ID },
        select: { metricsStartAt: true, currency: true },
      }),
      this.prisma.billingCombinedMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_COMBINED_BOUNDARY_ID },
        select: {
          metricsStartAt: true,
          captureActivatedAt: true,
          currency: true,
        },
      }),
    ]);
    if (
      [gross, refund, dispute, fee, combined].some(
        (item) => item.currency !== 'usd',
      )
    ) {
      throw new Error('Unsupported recorded financial currency');
    }
    return {
      from: later(
        gross.metricsStartAt,
        refund.metricsStartAt,
        dispute.metricsStartAt,
        fee.metricsStartAt,
        combined.metricsStartAt,
        ...(combined.captureActivatedAt ? [combined.captureActivatedAt] : []),
      ),
      active: combined.captureActivatedAt !== null,
    };
  }

  /** All inputs are a single already-clipped common UTC interval. */
  async getWindow(input: { from: Date; toExclusive: Date }) {
    const duration = input.toExclusive.getTime() - input.from.getTime();
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > MAX_DAYS * DAY_MS
    ) {
      throw new Error('Invalid recorded financial window');
    }
    return this.prisma.$transaction(
      async (tx) => {
        const unresolvedCaseCount = await tx.billingFinancialEvidenceCase.count(
          {
            where: {
              state: BillingEvidenceState.pending,
              OR: [
                { effectiveAt: null },
                { effectiveAt: { gte: input.from, lt: input.toExclusive } },
              ],
            },
          },
        );
        if (unresolvedCaseCount > 0)
          return { unresolvedCaseCount, daily: [] as RecordedFinancialDay[] };

        const firstDay = utcDay(input.from);
        const lastDay = utcDay(new Date(input.toExclusive.getTime() - 1));
        const fullFrom =
          input.from.getTime() === firstDay.getTime()
            ? firstDay
            : new Date(firstDay.getTime() + DAY_MS);
        const fullTo =
          input.toExclusive.getTime() % DAY_MS === 0
            ? input.toExclusive
            : lastDay;
        const hasFullDays = fullFrom < fullTo;
        const [grossRows, refundRows, disputeRows, feeRows] = hasFullDays
          ? await Promise.all([
              tx.billingDailyFinancialMetric.findMany({
                where: { currency: 'usd', day: { gte: fullFrom, lt: fullTo } },
                select: { day: true, grossRevenueMinor: true },
                take: MAX_DAYS,
              }),
              tx.billingDailyRefundMetric.findMany({
                where: { currency: 'usd', day: { gte: fullFrom, lt: fullTo } },
                select: { day: true, refundAdjustmentMinor: true },
                take: MAX_DAYS,
              }),
              tx.billingDailyDisputeMetric.findMany({
                where: { currency: 'usd', day: { gte: fullFrom, lt: fullTo } },
                select: {
                  day: true,
                  withdrawnMinor: true,
                  reinstatedMinor: true,
                },
                take: MAX_DAYS,
              }),
              tx.billingDailyStripeFeeMetric.findMany({
                where: { currency: 'usd', day: { gte: fullFrom, lt: fullTo } },
                select: { day: true, feeMinor: true },
                take: MAX_DAYS,
              }),
            ])
          : [[], [], [], []];
        const gross = new Map(
          grossRows.map((row) => [row.day.getTime(), row.grossRevenueMinor]),
        );
        const refunds = new Map(
          refundRows.map((row) => [
            row.day.getTime(),
            row.refundAdjustmentMinor,
          ]),
        );
        const disputes = new Map(
          disputeRows.map((row) => [row.day.getTime(), row]),
        );
        const fees = new Map(
          feeRows.map((row) => [row.day.getTime(), row.feeMinor]),
        );

        const daily: RecordedFinancialDay[] = [];
        for (
          let at = firstDay.getTime();
          at <= lastDay.getTime();
          at += DAY_MS
        ) {
          const from = new Date(Math.max(at, input.from.getTime()));
          const toExclusive = new Date(
            Math.min(at + DAY_MS, input.toExclusive.getTime()),
          );
          const partial =
            from.getTime() !== at || toExclusive.getTime() !== at + DAY_MS;
          let grossRevenueMinor = gross.get(at) ?? 0n;
          let refundAdjustmentMinor = refunds.get(at) ?? 0n;
          let disputeWithdrawalMinor = disputes.get(at)?.withdrawnMinor ?? 0n;
          let disputeReinstatementMinor =
            disputes.get(at)?.reinstatedMinor ?? 0n;
          let stripeFeeMinor = fees.get(at) ?? 0n;
          if (partial) {
            const [payment, refund, withdrawal, reinstatement, fee] =
              await Promise.all([
                tx.billingFinancialEvent.aggregate({
                  where: {
                    currency: 'usd',
                    effectiveAt: { gte: from, lt: toExclusive },
                  },
                  _sum: { amountMinor: true },
                }),
                tx.billingRefundEffect.aggregate({
                  where: {
                    currency: 'usd',
                    effectiveAt: { gte: from, lt: toExclusive },
                  },
                  _sum: { amountMinor: true },
                }),
                tx.billingDisputeEffect.aggregate({
                  where: {
                    currency: 'usd',
                    kind: BillingDisputeMovementKind.withdrawal,
                    effectiveAt: { gte: from, lt: toExclusive },
                  },
                  _sum: { amountMinor: true },
                }),
                tx.billingDisputeEffect.aggregate({
                  where: {
                    currency: 'usd',
                    kind: BillingDisputeMovementKind.reinstatement,
                    effectiveAt: { gte: from, lt: toExclusive },
                  },
                  _sum: { amountMinor: true },
                }),
                tx.billingStripeFeeEffect.aggregate({
                  where: {
                    currency: 'usd',
                    effectiveAt: { gte: from, lt: toExclusive },
                  },
                  _sum: { feeMinor: true },
                }),
              ]);
            grossRevenueMinor = payment._sum.amountMinor ?? 0n;
            refundAdjustmentMinor = refund._sum.amountMinor ?? 0n;
            disputeWithdrawalMinor = withdrawal._sum.amountMinor ?? 0n;
            disputeReinstatementMinor = reinstatement._sum.amountMinor ?? 0n;
            stripeFeeMinor = fee._sum.feeMinor ?? 0n;
          }
          daily.push({
            day: new Date(at).toISOString().slice(0, 10),
            coverage: partial ? 'partial' : 'complete',
            grossRevenueMinor,
            refundAdjustmentMinor,
            disputeWithdrawalMinor,
            disputeReinstatementMinor,
            stripeFeeMinor,
            recordedNetRevenueMinor:
              grossRevenueMinor +
              refundAdjustmentMinor +
              disputeWithdrawalMinor +
              disputeReinstatementMinor -
              stripeFeeMinor,
          });
        }
        return { unresolvedCaseCount, daily };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

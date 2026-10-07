import { PrismaService } from '../src/database/prisma/prisma.service';
import { BillingRecordedNetRevenueService } from '../src/modules/billing/application/billing-recorded-net-revenue.service';
import { BillingFinancialMetricsReadService } from '../src/modules/billing/application/billing-financial-metrics-read.service';
import { BillingStripeFeeMetricsReadService } from '../src/modules/billing/application/billing-stripe-fee-metrics-read.service';
import { BillingMetricsReadService } from '../src/modules/billing/application/billing-metrics-read.service';
import {
  BillingFinancialCompletenessService,
  BILLING_COMBINED_BOUNDARY_ID,
} from '../src/modules/billing/application/billing-financial-completeness.service';
import {
  BILLING_FINANCIAL_METRICS_BOUNDARY_ID,
  BILLING_REFUND_METRICS_BOUNDARY_ID,
  BILLING_DISPUTE_METRICS_BOUNDARY_ID,
} from '../src/modules/billing/application/billing-financial-metrics-recorder.service';
import { BILLING_STRIPE_FEE_BOUNDARY_ID } from '../src/modules/billing/application/billing-stripe-fee.service';
import {
  AiCostLedgerService,
  AI_COST_BOUNDARY_ID,
} from '../src/modules/ai/application/ai-cost-ledger.service';
import { AiMetricsReadService } from '../src/modules/ai/application/ai-metrics-read.service';
import { AdminMetricsService } from '../src/modules/admin/application/admin-metrics.service';

const runId = `recorded${process.pid}${Date.now()}`;
const DAY_MS = 86_400_000;
const utcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

describe('recorded net revenue and estimated contribution margin PostgreSQL integration', () => {
  let prisma: PrismaService;
  let admin: AdminMetricsService;
  let boundaryDay: Date;
  let effectDay: Date;
  let commonStart: Date;
  let original: Array<{
    id: string;
    metricsStartAt: Date;
    captureActivatedAt?: Date | null;
  }> = [];
  const eventIds = [
    'gross',
    'refund',
    'withdrawal',
    'reinstatement',
    'fee',
    'preboundary',
    'boundarygross',
    'boundaryfee',
    'preboundaryfee',
  ].map((kind) => `evt_${runId}${kind}`);
  const intentId = `intent_${runId}`;
  const preBoundaryIntentId = `intent_${runId}before`;
  const boundaryIntentId = `intent_${runId}at`;
  const pendingIntentId = `intent_${runId}pending`;
  const intentIds = [
    intentId,
    preBoundaryIntentId,
    boundaryIntentId,
    pendingIntentId,
  ];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test'))
      throw new Error('Isolated test DATABASE_URL required');
    prisma = new PrismaService();
    await prisma.$connect();
    const now = new Date();
    effectDay = new Date(utcDay(now).getTime() - DAY_MS);
    boundaryDay = new Date(effectDay.getTime() - DAY_MS);
    const billingStart = new Date(boundaryDay.getTime() + 12 * 60 * 60_000);
    commonStart = new Date(boundaryDay.getTime() + 13 * 60 * 60_000);
    const [gross, refund, dispute, fee, combined, ai] = await Promise.all([
      prisma.billingFinancialMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID },
      }),
      prisma.billingRefundMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_REFUND_METRICS_BOUNDARY_ID },
      }),
      prisma.billingDisputeMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_DISPUTE_METRICS_BOUNDARY_ID },
      }),
      prisma.billingStripeFeeMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_STRIPE_FEE_BOUNDARY_ID },
      }),
      prisma.billingCombinedMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_COMBINED_BOUNDARY_ID },
      }),
      prisma.aiCostMetricsBoundary.findUniqueOrThrow({
        where: { id: AI_COST_BOUNDARY_ID },
      }),
    ]);
    original = [gross, refund, dispute, fee, combined, ai];
    await Promise.all([
      prisma.billingFinancialMetricsBoundary.update({
        where: { id: gross.id },
        data: { metricsStartAt: new Date(boundaryDay.getTime() + 9 * 60 * 60_000) },
      }),
      prisma.billingRefundMetricsBoundary.update({
        where: { id: refund.id },
        data: { metricsStartAt: new Date(boundaryDay.getTime() + 10 * 60 * 60_000) },
      }),
      prisma.billingDisputeMetricsBoundary.update({
        where: { id: dispute.id },
        data: { metricsStartAt: new Date(boundaryDay.getTime() + 11 * 60 * 60_000) },
      }),
      prisma.billingStripeFeeMetricsBoundary.update({
        where: { id: fee.id },
        data: { metricsStartAt: billingStart },
      }),
      prisma.billingCombinedMetricsBoundary.update({
        where: { id: combined.id },
        data: { metricsStartAt: commonStart, captureActivatedAt: commonStart },
      }),
      prisma.aiCostMetricsBoundary.update({
        where: { id: ai.id },
        data: { metricsStartAt: billingStart, captureActivatedAt: billingStart },
      }),
    ]);
    const billing = new BillingMetricsReadService(prisma);
    admin = new AdminMetricsService(
      billing,
      new BillingFinancialMetricsReadService(prisma),
      new AiMetricsReadService(prisma),
      new BillingStripeFeeMetricsReadService(prisma),
      new BillingFinancialCompletenessService(prisma),
      new AiCostLedgerService(prisma),
      new BillingRecordedNetRevenueService(prisma),
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.billingFinancialEvidenceCase.deleteMany({
      where: { sourceStripeEventId: { in: eventIds } },
    });
    await prisma.billingFinancialEvent.deleteMany({
      where: { sourceStripeEventId: { in: eventIds } },
    });
    await prisma.billingRefundEffect.deleteMany({
      where: { sourceStripeEventId: { in: eventIds } },
    });
    await prisma.billingDisputeEffect.deleteMany({
      where: { sourceStripeEventId: { in: eventIds } },
    });
    await prisma.billingStripeFeeEffect.deleteMany({
      where: { sourceStripeEventId: { in: eventIds } },
    });
    await prisma.billingRefund.deleteMany({
      where: { stripeRefundId: `re_${runId}` },
    });
    await prisma.billingDispute.deleteMany({
      where: { stripeDisputeId: `du_${runId}` },
    });
    await prisma.stripeWebhookEvent.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.aiCostEvent.deleteMany({ where: { intentId: { in: intentIds } } });
    await prisma.aiCostIntent.deleteMany({ where: { id: { in: intentIds } } });
    for (const day of [boundaryDay, effectDay].filter(Boolean)) {
      const where = { day };
      await Promise.all([
        prisma.billingDailyFinancialMetric.deleteMany({ where }),
        prisma.billingDailyRefundMetric.deleteMany({ where }),
        prisma.billingDailyDisputeMetric.deleteMany({ where }),
        prisma.billingDailyStripeFeeMetric.deleteMany({ where }),
        prisma.aiDailyCostMetric.deleteMany({ where }),
      ]);
    }
    if (original.length === 6) {
      const [gross, refund, dispute, fee, combined, ai] = original;
      await Promise.all([
        prisma.billingFinancialMetricsBoundary.update({
          where: { id: gross.id },
          data: { metricsStartAt: gross.metricsStartAt },
        }),
        prisma.billingRefundMetricsBoundary.update({
          where: { id: refund.id },
          data: { metricsStartAt: refund.metricsStartAt },
        }),
        prisma.billingDisputeMetricsBoundary.update({
          where: { id: dispute.id },
          data: { metricsStartAt: dispute.metricsStartAt },
        }),
        prisma.billingStripeFeeMetricsBoundary.update({
          where: { id: fee.id },
          data: { metricsStartAt: fee.metricsStartAt },
        }),
        prisma.billingCombinedMetricsBoundary.update({
          where: { id: combined.id },
          data: {
            metricsStartAt: combined.metricsStartAt,
            captureActivatedAt: combined.captureActivatedAt,
          },
        }),
        prisma.aiCostMetricsBoundary.update({
          where: { id: ai.id },
          data: {
            metricsStartAt: ai.metricsStartAt,
            captureActivatedAt: ai.captureActivatedAt,
          },
        }),
      ]);
    }
    await prisma.$disconnect();
  });

  it('composes signed full-day effects and intraday exclusions, then withholds unresolved evidence', async () => {
    const effectiveAt = new Date(effectDay.getTime() + 60_000);
    const beforeBoundary = new Date(commonStart.getTime() - 1);
    await prisma.stripeWebhookEvent.createMany({
      data: eventIds.map((eventId) => ({ eventId, type: 'synthetic.test' })),
    });
    await prisma.billingFinancialEvent.createMany({
      data: [
        {
          sourceStripeEventId: eventIds[0],
          category: 'gross_revenue',
          amountMinor: 1_000n,
          effectiveAt,
        },
        {
          sourceStripeEventId: eventIds[5],
          category: 'gross_revenue',
          amountMinor: 9_999n,
          effectiveAt: beforeBoundary,
        },
        {
          sourceStripeEventId: eventIds[6],
          category: 'gross_revenue',
          amountMinor: 400n,
          effectiveAt: commonStart,
        },
      ],
    });
    const refund = await prisma.billingRefund.create({
      data: {
        stripeRefundId: `re_${runId}`,
        amountMinor: 200n,
        currency: 'usd',
        currencySupport: 'usd',
        providerCreatedAt: effectiveAt,
      },
    });
    await prisma.billingRefundEffect.create({
      data: {
        refundId: refund.id,
        sourceStripeEventId: eventIds[1],
        amountMinor: -200n,
        effectiveAt,
      },
    });
    const dispute = await prisma.billingDispute.create({
      data: {
        stripeDisputeId: `du_${runId}`,
        currency: 'usd',
        providerCreatedAt: effectiveAt,
        currentStatus: 'won',
        currentStatusEventAt: effectiveAt,
        currentStatusEventId: eventIds[3],
      },
    });
    await prisma.billingDisputeEffect.createMany({
      data: [
        {
          disputeId: dispute.id,
          sourceStripeEventId: eventIds[2],
          balanceTransactionId: `txn_${runId}out`,
          kind: 'withdrawal',
          amountMinor: -300n,
          effectiveAt,
        },
        {
          disputeId: dispute.id,
          sourceStripeEventId: eventIds[3],
          balanceTransactionId: `txn_${runId}back`,
          kind: 'reinstatement',
          amountMinor: 100n,
          effectiveAt,
        },
      ],
    });
    await prisma.billingStripeFeeEffect.createMany({
      data: [{
        sourceStripeEventId: eventIds[4],
        balanceTransactionId: `txn_${runId}fee`,
        feeMinor: -25n,
        currency: 'usd',
        effectiveAt,
      }, {
        sourceStripeEventId: eventIds[7],
        balanceTransactionId: `txn_${runId}boundaryfee`,
        feeMinor: 20n,
        currency: 'usd',
        effectiveAt: commonStart,
      }, {
        sourceStripeEventId: eventIds[8],
        balanceTransactionId: `txn_${runId}beforefee`,
        feeMinor: 500n,
        currency: 'usd',
        effectiveAt: beforeBoundary,
      }],
    });
    await Promise.all([
      prisma.billingDailyFinancialMetric.create({
        data: {
          day: effectDay,
          grossRevenueMinor: 1_000n,
          successfulPaymentCount: 1,
        },
      }),
      prisma.billingDailyRefundMetric.create({
        data: {
          day: effectDay,
          refundAdjustmentMinor: -200n,
          successfulRefundCount: 1,
        },
      }),
      prisma.billingDailyDisputeMetric.create({
        data: {
          day: effectDay,
          withdrawnMinor: -300n,
          reinstatedMinor: 100n,
          withdrawalCount: 1,
          reinstatementCount: 1,
        },
      }),
      prisma.billingDailyStripeFeeMetric.create({
        data: { day: effectDay, feeMinor: -25n, feeEffectCount: 1 },
      }),
      prisma.aiCostIntent.create({
        data: {
          id: intentId,
          startedAt: effectiveAt,
          effectiveAt,
          state: 'costed',
        },
      }),
    ]);
    await prisma.aiCostEvent.create({
      data: {
        intentId,
        kind: 'estimate',
        estimatedMicroUsd: 1_250_000n,
        effectiveAt,
      },
    });
    await prisma.aiDailyCostMetric.create({
      data: {
        day: effectDay,
        estimatedMicroUsd: 1_250_000n,
        costedRequestCount: 1,
      },
    });
    await prisma.aiCostIntent.createMany({ data: [
      { id: preBoundaryIntentId, startedAt: beforeBoundary,
        effectiveAt: beforeBoundary, state: 'costed' },
      { id: boundaryIntentId, startedAt: commonStart,
        effectiveAt: commonStart, state: 'costed' },
    ] });
    await prisma.aiCostEvent.createMany({ data: [
      { intentId: preBoundaryIntentId, kind: 'estimate',
        estimatedMicroUsd: 2_000_000n, effectiveAt: beforeBoundary },
      { intentId: boundaryIntentId, kind: 'estimate',
        estimatedMicroUsd: 500_000n, effectiveAt: commonStart },
    ] });
    // Whole-day aggregates deliberately include pre-boundary effects. The
    // common boundary day must use exact-timestamp source effects instead.
    await Promise.all([
      prisma.billingDailyFinancialMetric.create({ data: {
        day: boundaryDay, grossRevenueMinor: 10_399n, successfulPaymentCount: 2,
      } }),
      prisma.billingDailyStripeFeeMetric.create({ data: {
        day: boundaryDay, feeMinor: 520n, feeEffectCount: 2,
      } }),
      prisma.aiDailyCostMetric.create({ data: {
        day: boundaryDay, estimatedMicroUsd: 2_500_000n, costedRequestCount: 2,
      } }),
    ]);

    const from = boundaryDay.toISOString().slice(0, 10);
    const to = effectDay.toISOString().slice(0, 10);
    expect(await new BillingRecordedNetRevenueService(prisma).getBoundary()).toEqual({
      from: commonStart,
      active: true,
    });
    expect(await new AiCostLedgerService(prisma).getRecordedBoundary()).toEqual({
      from: new Date(commonStart.getTime() - 60 * 60_000),
      active: true,
    });
    const result = await admin.getMetrics({ from, to });
    expect(result.recordedFinancials.status).toBe('partial');
    expect(result.recordedFinancials.actualCoveredRange?.from).toBe(
      commonStart.toISOString(),
    );
    expect(result.recordedFinancials.actualCoveredRange?.toExclusive).toBe(
      new Date(effectDay.getTime() + DAY_MS).toISOString(),
    );
    expect(result.recordedFinancials.totals).toEqual({
      grossRevenueMinor: 1_400,
      refundAdjustmentMinor: -200,
      disputeWithdrawalMinor: -300,
      disputeReinstatementMinor: 100,
      recordedStripeFeeMinor: -5,
      recordedNetRevenueMinor: 1_005,
      estimatedAiCostMicroUsd: 1_750_000,
      estimatedContributionMarginMicroUsd: 8_300_000,
    });
    expect(result.recordedFinancials.daily).toEqual([
      expect.objectContaining({
        day: from,
        coverage: 'partial',
        grossRevenueMinor: 400,
        recordedStripeFeeMinor: 20,
        recordedNetRevenueMinor: 380,
        estimatedAiCostMicroUsd: 500_000,
        estimatedContributionMarginMicroUsd: 3_300_000,
      }),
      expect.objectContaining({
        day: to,
        coverage: 'complete',
        recordedNetRevenueMinor: 625,
        estimatedAiCostMicroUsd: 1_250_000,
        estimatedContributionMarginMicroUsd: 5_000_000,
      }),
    ]);
    expect(JSON.stringify(result.recordedFinancials)).not.toMatch(
      /evt_|txn_|re_|du_|userId|email|prompt|token|metadata/i,
    );

    await prisma.billingFinancialEvidenceCase.create({
      data: {
        sourceStripeEventId: eventIds[4],
        component: 'stripe_fee',
        eventType: 'charge.updated',
        state: 'pending',
        effectiveAt: null,
      },
    });
    const unresolved = await admin.getMetrics({ from, to });
    expect(unresolved.recordedFinancials).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        totals: null,
        daily: [],
      }),
    );
    await prisma.billingFinancialEvidenceCase.deleteMany({
      where: { sourceStripeEventId: eventIds[4] },
    });
    await prisma.aiCostIntent.create({ data: {
      id: pendingIntentId, startedAt: commonStart, state: 'pending',
    } });
    const unresolvedAi = await admin.getMetrics({ from, to });
    expect(unresolvedAi.recordedFinancials).toEqual(
      expect.objectContaining({ status: 'unresolved', totals: null, daily: [] }),
    );
    expect(unresolvedAi.financialEvidenceCoverage.unresolvedCaseCount).toBe(0);
    expect(unresolvedAi.estimatedAiCostCoverage.unresolvedRequestCount).toBe(1);
    await prisma.aiCostIntent.delete({ where: { id: pendingIntentId } });
    const pre = await admin.getMetrics({
      from: new Date(boundaryDay.getTime() - DAY_MS).toISOString().slice(0, 10),
      to: new Date(boundaryDay.getTime() - DAY_MS).toISOString().slice(0, 10),
    });
    expect(pre.recordedFinancials).toEqual(
      expect.objectContaining({
        status: 'unavailable',
        totals: null,
        daily: [],
      }),
    );
  });
});

import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BillingFinancialEventCategory,
  Prisma,
} from '@prisma/client';

export const BILLING_FINANCIAL_METRICS_BOUNDARY_ID =
  'future_financial_metrics_v1';

export interface RecordSuccessfulInvoiceInput {
  sourceStripeEventId: string;
  eventType: string;
  amountMinor: number;
  currency: string;
  effectiveAt: Date;
  observedAt: Date;
}

@Injectable()
export class BillingFinancialMetricsRecorderService {
  async recordSuccessfulInvoiceInTransaction(
    transaction: Prisma.TransactionClient,
    input: RecordSuccessfulInvoiceInput,
  ): Promise<{ id: string; sequence: bigint } | null> {
    if (input.eventType !== 'invoice.payment_succeeded') return null;
    if (input.currency.toLowerCase() !== 'usd') {
      throw new BadRequestException('Unsupported financial metrics currency');
    }
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) {
      throw new BadRequestException('Invalid successful payment amount');
    }
    if (
      !Number.isFinite(input.effectiveAt.getTime()) ||
      !Number.isFinite(input.observedAt.getTime())
    ) {
      throw new BadRequestException('Invalid financial event timestamp');
    }

    const boundary =
      await transaction.billingFinancialMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID },
        select: { metricsStartAt: true, currency: true },
      });
    if (boundary.currency !== 'usd') {
      throw new Error('Financial metrics boundary currency is unsupported');
    }
    if (input.effectiveAt < boundary.metricsStartAt) return null;

    const event = await transaction.billingFinancialEvent.create({
      data: {
        sourceStripeEventId: input.sourceStripeEventId,
        category: BillingFinancialEventCategory.gross_revenue,
        amountMinor: BigInt(input.amountMinor),
        currency: 'usd',
        effectiveAt: input.effectiveAt,
        observedAt: input.observedAt,
      },
      select: { id: true, sequence: true },
    });
    const day = this.utcDay(input.effectiveAt);
    await transaction.billingDailyFinancialMetric.upsert({
      where: { day_currency: { day, currency: 'usd' } },
      create: {
        day,
        currency: 'usd',
        grossRevenueMinor: BigInt(input.amountMinor),
        successfulPaymentCount: 1,
      },
      update: {
        grossRevenueMinor: { increment: BigInt(input.amountMinor) },
        successfulPaymentCount: { increment: 1 },
      },
    });
    return event;
  }

  private utcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BillingFinancialEventCategory,
  BillingRefundCurrencySupport,
  BillingRefundStatus,
  BillingDisputeMovementKind,
  BillingDisputeObservationResolution,
  BillingDisputeObservationType,
  BillingDisputeStatus,
  Prisma,
} from '@prisma/client';
import Stripe from 'stripe';
import { isDisputeMovementEvent, selectDisputeMovement } from './billing-dispute-movement';

export const BILLING_FINANCIAL_METRICS_BOUNDARY_ID =
  'future_financial_metrics_v1';
export const BILLING_REFUND_METRICS_BOUNDARY_ID = 'stripe_refunds_v1';
export const BILLING_DISPUTE_METRICS_BOUNDARY_ID = 'stripe_disputes_v1';

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
  async recordDisputeInTransaction(
    transaction: Prisma.TransactionClient,
    event: Stripe.Event,
    observedAt: Date,
    retrievedDispute?: Stripe.Dispute,
  ): Promise<void> {
    const types: Record<string, BillingDisputeObservationType> = {
      'charge.dispute.created': BillingDisputeObservationType.created,
      'charge.dispute.updated': BillingDisputeObservationType.updated,
      'charge.dispute.closed': BillingDisputeObservationType.closed,
      'charge.dispute.funds_withdrawn': BillingDisputeObservationType.funds_withdrawn,
      'charge.dispute.funds_reinstated': BillingDisputeObservationType.funds_reinstated,
    };
    const type = types[event.type];
    if (!type) return;
    const data = event.data?.object as Partial<Stripe.Dispute> | undefined;
    if (
      !data || data.object !== 'dispute' ||
      typeof data.id !== 'string' || !/^du_[A-Za-z0-9]+$/.test(data.id) ||
      !Object.values(BillingDisputeStatus).includes(data.status as BillingDisputeStatus) ||
      typeof data.currency !== 'string' || !/^[a-z]{3}$/.test(data.currency) ||
      !Number.isSafeInteger(data.created) || (data.created ?? 0) <= 0 ||
      !Number.isSafeInteger(event.created) || event.created <= 0 ||
      !Number.isFinite(observedAt.getTime()) ||
      (retrievedDispute && retrievedDispute.id !== data.id)
    ) {
      throw new BadRequestException('Invalid dispute webhook');
    }
    const providerId = (value: string | { id: string } | null | undefined) =>
      typeof value === 'string' ? value : value?.id ?? null;
    const chargeId = providerId(data.charge as string | { id: string } | null | undefined);
    const paymentIntentId = providerId(data.payment_intent as string | { id: string } | null | undefined);
    if (
      (chargeId !== null && !/^ch_[A-Za-z0-9]+$/.test(chargeId)) ||
      (paymentIntentId !== null && !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId))
    ) {
      throw new BadRequestException('Invalid dispute webhook');
    }
    const eventAt = new Date(event.created * 1_000);
    const providerCreatedAt = new Date(data.created! * 1_000);
    if (!Number.isFinite(eventAt.getTime()) || !Number.isFinite(providerCreatedAt.getTime())) {
      throw new BadRequestException('Invalid dispute webhook');
    }
    await transaction.billingDispute.createMany({
      data: [{
        stripeDisputeId: data.id,
        chargeId,
        paymentIntentId,
        currency: data.currency,
        providerCreatedAt,
        currentStatus: data.status as BillingDisputeStatus,
        currentStatusEventAt: eventAt,
        currentStatusEventId: event.id,
      }],
      skipDuplicates: true,
    });
    const dispute = await transaction.billingDispute.findUniqueOrThrow({
      where: { stripeDisputeId: data.id },
      select: { id: true, currency: true, providerCreatedAt: true },
    });
    if (dispute.currency !== data.currency ||
      dispute.providerCreatedAt.getTime() !== providerCreatedAt.getTime()) {
      throw new BadRequestException('Inconsistent dispute webhook');
    }
    await transaction.billingDispute.updateMany({
      where: {
        id: dispute.id,
        OR: [
          { currentStatusEventAt: { lt: eventAt } },
          { currentStatusEventAt: eventAt, currentStatusEventId: { lt: event.id } },
        ],
      },
      data: {
        currentStatus: data.status as BillingDisputeStatus,
        currentStatusEventAt: eventAt,
        currentStatusEventId: event.id,
      },
    });

    let resolution: BillingDisputeObservationResolution =
      BillingDisputeObservationResolution.status_only;
    let balanceTransactionId: string | null = null;
    if (isDisputeMovementEvent(event.type)) {
      const movement = selectDisputeMovement(data, event.type) ??
        selectDisputeMovement(retrievedDispute, event.type);
      if (!movement) {
        resolution = BillingDisputeObservationResolution.missing_authoritative_transaction;
      } else {
        balanceTransactionId = movement.id;
        if (data.currency !== 'usd' || movement.currency !== 'usd') {
          resolution = BillingDisputeObservationResolution.unsupported_currency;
        } else {
          const effectiveAt = new Date(movement.created * 1_000);
          if (!Number.isFinite(effectiveAt.getTime())) {
            throw new BadRequestException('Invalid dispute movement timestamp');
          }
          const boundary = await transaction.billingDisputeMetricsBoundary.findUniqueOrThrow({
            where: { id: BILLING_DISPUTE_METRICS_BOUNDARY_ID },
            select: { metricsStartAt: true, currency: true },
          });
          if (boundary.currency !== 'usd') {
            throw new Error('Dispute metrics boundary currency is unsupported');
          }
          if (effectiveAt < boundary.metricsStartAt) {
            resolution = BillingDisputeObservationResolution.pre_boundary;
          } else {
            const kind = event.type === 'charge.dispute.funds_withdrawn'
              ? BillingDisputeMovementKind.withdrawal
              : BillingDisputeMovementKind.reinstatement;
            const inserted = await transaction.billingDisputeEffect.createMany({
              data: [{
                disputeId: dispute.id,
                sourceStripeEventId: event.id,
                balanceTransactionId: movement.id,
                kind,
                amountMinor: BigInt(movement.amount),
                currency: 'usd',
                effectiveAt,
              }],
              skipDuplicates: true,
            });
            if (inserted.count === 0) {
              const existing = await transaction.billingDisputeEffect.findFirst({
                where: {
                  OR: [
                    { disputeId: dispute.id, kind },
                    { balanceTransactionId: movement.id },
                  ],
                },
                select: {
                  disputeId: true, balanceTransactionId: true, kind: true,
                  amountMinor: true, effectiveAt: true,
                },
              });
              if (!existing || existing.disputeId !== dispute.id ||
                existing.balanceTransactionId !== movement.id ||
                existing.kind !== kind ||
                existing.amountMinor !== BigInt(movement.amount) ||
                existing.effectiveAt.getTime() !== effectiveAt.getTime()) {
                throw new BadRequestException('Conflicting dispute movement');
              }
              resolution = BillingDisputeObservationResolution.duplicate_movement;
            } else {
              resolution = BillingDisputeObservationResolution.movement_recorded;
              const day = this.utcDay(effectiveAt);
              await transaction.billingDailyDisputeMetric.upsert({
                where: { day_currency: { day, currency: 'usd' } },
                create: {
                  day,
                  currency: 'usd',
                  withdrawnMinor: kind === BillingDisputeMovementKind.withdrawal
                    ? BigInt(movement.amount) : 0n,
                  reinstatedMinor: kind === BillingDisputeMovementKind.reinstatement
                    ? BigInt(movement.amount) : 0n,
                  withdrawalCount: kind === BillingDisputeMovementKind.withdrawal ? 1 : 0,
                  reinstatementCount: kind === BillingDisputeMovementKind.reinstatement ? 1 : 0,
                },
                update: kind === BillingDisputeMovementKind.withdrawal
                  ? { withdrawnMinor: { increment: BigInt(movement.amount) }, withdrawalCount: { increment: 1 } }
                  : { reinstatedMinor: { increment: BigInt(movement.amount) }, reinstatementCount: { increment: 1 } },
              });
            }
          }
        }
      }
    }
    await transaction.billingDisputeObservation.create({
      data: {
        disputeId: dispute.id,
        sourceStripeEventId: event.id,
        type,
        status: data.status as BillingDisputeStatus,
        resolution,
        balanceTransactionId,
        eventAt,
        observedAt,
      },
    });
  }

  async recordRefundInTransaction(
    transaction: Prisma.TransactionClient,
    event: Stripe.Event,
    observedAt: Date,
  ): Promise<void> {
    if (event.type !== 'refund.created' && event.type !== 'refund.updated') {
      return;
    }
    const data = event.data?.object as Partial<Stripe.Refund> | undefined;
    const allowedStatuses = Object.values(BillingRefundStatus) as string[];
    if (
      !data || data.object !== 'refund' ||
      typeof data.id !== 'string' || !/^re_[A-Za-z0-9]+$/.test(data.id) ||
      !Number.isSafeInteger(data.amount) || (data.amount ?? -1) < 0 ||
      typeof data.currency !== 'string' || !/^[a-z]{3}$/.test(data.currency) ||
      !allowedStatuses.includes(data.status ?? '') ||
      !Number.isSafeInteger(data.created) || (data.created ?? 0) <= 0 ||
      !Number.isSafeInteger(event.created) || event.created <= 0 ||
      !Number.isFinite(observedAt.getTime())
    ) {
      throw new BadRequestException('Invalid refund webhook');
    }
    const refundId = data.id;
    const amountMinor = data.amount!;
    const currency = data.currency;
    const status = data.status as BillingRefundStatus;
    const eventAt = new Date(event.created * 1000);
    const providerCreatedAt = new Date(data.created! * 1000);
    if (!Number.isFinite(eventAt.getTime()) || !Number.isFinite(providerCreatedAt.getTime())) {
      throw new BadRequestException('Invalid refund webhook');
    }
    const providerId = (value: string | { id: string } | null | undefined) =>
      typeof value === 'string' ? value : value?.id ?? null;
    const chargeId = providerId(data.charge as string | { id: string } | null | undefined);
    const paymentIntentId = providerId(
      data.payment_intent as string | { id: string } | null | undefined,
    );
    if (
      (chargeId !== null && !/^ch_[A-Za-z0-9]+$/.test(chargeId)) ||
      (paymentIntentId !== null && !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId))
    ) {
      throw new BadRequestException('Invalid refund webhook');
    }

    await transaction.billingRefund.createMany({
      data: [{
        stripeRefundId: refundId,
        chargeId,
        paymentIntentId,
        amountMinor: BigInt(amountMinor),
        currency,
        currencySupport: currency === 'usd'
          ? BillingRefundCurrencySupport.usd
          : BillingRefundCurrencySupport.unsupported,
        providerCreatedAt,
      }],
      skipDuplicates: true,
    });
    const refund = await transaction.billingRefund.findUniqueOrThrow({
      where: { stripeRefundId: refundId },
      select: { id: true, amountMinor: true, currency: true, providerCreatedAt: true },
    });
    if (
      refund.amountMinor !== BigInt(amountMinor) ||
      refund.currency !== currency ||
      refund.providerCreatedAt.getTime() !== providerCreatedAt.getTime()
    ) {
      throw new BadRequestException('Inconsistent refund webhook');
    }
    await transaction.billingRefundObservation.create({
      data: {
        refundId: refund.id,
        sourceStripeEventId: event.id,
        status,
        eventAt,
        observedAt,
      },
    });
    if (status !== BillingRefundStatus.succeeded) return;

    const claimed = await transaction.billingRefund.updateMany({
      where: { id: refund.id, firstSucceededSourceEventId: null },
      data: { firstSucceededSourceEventId: event.id, firstSucceededAt: eventAt },
    });
    if (claimed.count !== 1 || currency !== 'usd') return;
    const boundary = await transaction.billingRefundMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_REFUND_METRICS_BOUNDARY_ID },
      select: { metricsStartAt: true, currency: true },
    });
    if (boundary.currency !== 'usd') {
      throw new Error('Refund metrics boundary currency is unsupported');
    }
    if (eventAt < boundary.metricsStartAt) return;

    const negativeAmount = -BigInt(amountMinor);
    await transaction.billingRefundEffect.create({
      data: {
        refundId: refund.id,
        sourceStripeEventId: event.id,
        amountMinor: negativeAmount,
        effectiveAt: eventAt,
      },
    });
    const day = this.utcDay(eventAt);
    await transaction.billingDailyRefundMetric.upsert({
      where: { day_currency: { day, currency: 'usd' } },
      create: {
        day,
        currency: 'usd',
        refundAdjustmentMinor: negativeAmount,
        successfulRefundCount: 1,
      },
      update: {
        refundAdjustmentMinor: { increment: negativeAmount },
        successfulRefundCount: { increment: 1 },
      },
    });
  }

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

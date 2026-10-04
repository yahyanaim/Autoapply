import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingStripeFeeResolution, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { StripeAdapter } from '../infrastructure/stripe/stripe.adapter';
import { isDisputeMovementEvent, selectDisputeMovement } from './billing-dispute-movement';

export const BILLING_STRIPE_FEE_BOUNDARY_ID = 'stripe_fees_v1';

export type PreparedStripeFee = {
  balanceTransaction: Stripe.BalanceTransaction | null;
  missingFee: boolean;
};

const providerId = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : value?.id ?? null;

@Injectable()
export class BillingStripeFeeService {
  constructor(private readonly stripe: StripeAdapter) {}

  /** Resolve provider evidence before the DB transaction so a failed lookup is retryable. */
  async prepare(event: Stripe.Event, retrievedDispute?: Stripe.Dispute): Promise<PreparedStripeFee | null> {
    let transactionId: string | null = null;
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const paymentIntentId = providerId(invoice.payment_intent as string | { id: string } | null);
      if (paymentIntentId) {
        if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) throw new BadRequestException('Invalid fee reference');
        const intent = await this.stripe.retrievePaymentIntent(paymentIntentId);
        if (intent.id !== paymentIntentId) throw new BadRequestException('Invalid fee evidence');
        const chargeId = providerId(intent.latest_charge as string | { id: string } | null);
        if (chargeId) {
          if (!/^ch_[A-Za-z0-9]+$/.test(chargeId)) throw new BadRequestException('Invalid fee reference');
          const charge = await this.stripe.retrieveCharge(chargeId);
          if (charge.id !== chargeId) throw new BadRequestException('Invalid fee evidence');
          transactionId = providerId(charge.balance_transaction as string | { id: string } | null);
        }
      }
    } else if (event.type === 'charge.succeeded' || event.type === 'charge.updated') {
      const charge = event.data.object as Stripe.Charge;
      transactionId = providerId(charge.balance_transaction as string | { id: string } | null);
      if (!transactionId && /^ch_[A-Za-z0-9]+$/.test(charge.id ?? '')) {
        const current = await this.stripe.retrieveCharge(charge.id);
        if (current.id !== charge.id) throw new BadRequestException('Invalid fee evidence');
        transactionId = providerId(current.balance_transaction as string | { id: string } | null);
      }
    } else if (event.type === 'refund.created' || event.type === 'refund.updated') {
      const refund = event.data.object as Stripe.Refund;
      transactionId = providerId(refund.balance_transaction as string | { id: string } | null);
      if (!transactionId && /^re_[A-Za-z0-9]+$/.test(refund.id ?? '')) {
        const current = await this.stripe.retrieveRefund(refund.id);
        if (current.id !== refund.id) throw new BadRequestException('Invalid fee evidence');
        transactionId = providerId(current.balance_transaction as string | { id: string } | null);
      }
    } else if (isDisputeMovementEvent(event.type)) {
      transactionId = selectDisputeMovement(event.data.object, event.type)?.id ??
        selectDisputeMovement(retrievedDispute, event.type)?.id ?? null;
    } else {
      return null;
    }

    if (!transactionId) return { balanceTransaction: null, missingFee: false };
    if (!/^txn_[A-Za-z0-9]+$/.test(transactionId)) throw new BadRequestException('Invalid fee reference');
    const transaction = await this.stripe.retrieveBalanceTransaction(transactionId);
    if (transaction.id !== transactionId) throw new BadRequestException('Invalid fee evidence');
    return {
      balanceTransaction: transaction,
      missingFee: !Number.isSafeInteger(transaction.fee),
    };
  }

  async recordInTransaction(
    tx: Prisma.TransactionClient,
    sourceStripeEventId: string,
    prepared: PreparedStripeFee,
    observedAt: Date,
  ): Promise<void> {
    const transaction = prepared.balanceTransaction;
    let resolution: BillingStripeFeeResolution = BillingStripeFeeResolution.missing_authoritative_transaction;
    if (transaction) {
      if (!/^txn_[A-Za-z0-9]+$/.test(transaction.id) ||
        typeof transaction.currency !== 'string' ||
        !Number.isSafeInteger(transaction.created) || transaction.created <= 0) {
        throw new BadRequestException('Invalid fee evidence');
      }
      if (prepared.missingFee) {
        resolution = BillingStripeFeeResolution.missing_authoritative_fee;
      } else if (transaction.currency.toLowerCase() !== 'usd') {
        resolution = BillingStripeFeeResolution.unsupported_currency;
      } else {
        const effectiveAt = new Date(transaction.created * 1000);
        const boundary = await tx.billingStripeFeeMetricsBoundary.findUniqueOrThrow({
          where: { id: BILLING_STRIPE_FEE_BOUNDARY_ID },
          select: { metricsStartAt: true, currency: true },
        });
        if (boundary.currency !== 'usd') throw new Error('Fee metrics boundary currency is unsupported');
        if (effectiveAt < boundary.metricsStartAt) {
          resolution = BillingStripeFeeResolution.pre_boundary;
        } else if (transaction.fee === 0) {
          resolution = BillingStripeFeeResolution.zero_fee;
        } else {
          const inserted = await tx.billingStripeFeeEffect.createMany({
            data: [{
              sourceStripeEventId,
              balanceTransactionId: transaction.id,
              feeMinor: BigInt(transaction.fee),
              currency: 'usd',
              effectiveAt,
            }],
            skipDuplicates: true,
          });
          if (inserted.count === 0) {
            const existing = await tx.billingStripeFeeEffect.findUniqueOrThrow({
              where: { balanceTransactionId: transaction.id },
              select: { feeMinor: true, currency: true, effectiveAt: true },
            });
            if (existing.feeMinor !== BigInt(transaction.fee) || existing.currency !== 'usd' ||
              existing.effectiveAt.getTime() !== effectiveAt.getTime()) {
              throw new BadRequestException('Conflicting fee evidence');
            }
            resolution = BillingStripeFeeResolution.duplicate_balance_transaction;
          } else {
            resolution = BillingStripeFeeResolution.recorded;
            const day = new Date(Date.UTC(effectiveAt.getUTCFullYear(), effectiveAt.getUTCMonth(), effectiveAt.getUTCDate()));
            await tx.billingDailyStripeFeeMetric.upsert({
              where: { day_currency: { day, currency: 'usd' } },
              create: { day, currency: 'usd', feeMinor: BigInt(transaction.fee), feeEffectCount: 1 },
              update: { feeMinor: { increment: BigInt(transaction.fee) }, feeEffectCount: { increment: 1 } },
            });
          }
        }
      }
    }
    await tx.billingStripeFeeObservation.create({
      data: {
        sourceStripeEventId,
        resolution,
        balanceTransactionId: transaction?.id ?? null,
        observedAt,
      },
    });
  }
}

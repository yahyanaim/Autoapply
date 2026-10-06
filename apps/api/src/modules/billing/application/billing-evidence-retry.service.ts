import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  BillingDisputeMovementKind,
  BillingEvidenceComponent,
  BillingEvidenceState,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { StripeAdapter } from '../infrastructure/stripe/stripe.adapter';
import { BillingFinancialCompletenessService, BILLING_COMBINED_BOUNDARY_ID } from './billing-financial-completeness.service';
import { BILLING_DISPUTE_METRICS_BOUNDARY_ID } from './billing-financial-metrics-recorder.service';
import { BillingService } from './billing.service';
import { BillingStripeFeeService, BILLING_STRIPE_FEE_BOUNDARY_ID } from './billing-stripe-fee.service';
import { isDisputeMovementEvent, selectDisputeMovement } from './billing-dispute-movement';

type Claimed = Awaited<ReturnType<BillingFinancialCompletenessService['claimDue']>>[number];

/** Retry only minimal provider references; never store or log provider responses. */
@Injectable()
export class BillingEvidenceRetryService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeAdapter,
    private readonly completeness: BillingFinancialCompletenessService,
    private readonly stripeFees: BillingStripeFeeService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.processDueOnce().catch(() => undefined); }, 30_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processDueOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const claimed of await this.completeness.claimDue()) {
        try { await this.processCase(claimed); }
        catch { /* The case remains durable, bounded, and unresolved for the next attempt. */ }
        finally { await this.completeness.releaseClaim(claimed.id, claimed.fencingToken); }
      }
    } finally {
      this.running = false;
    }
  }

  private async processCase(claimed: Claimed): Promise<void> {
    if (!/^evt_[A-Za-z0-9]+$/.test(claimed.sourceStripeEventId)) return;
    const event = await this.stripe.retrieveEvent(claimed.sourceStripeEventId);
    if (event.id !== claimed.sourceStripeEventId || event.type !== claimed.eventType) return;
    const processed = await this.prisma.stripeWebhookEvent.findUnique({
      where: { eventId: event.id }, select: { id: true },
    });
    if (!processed) {
      // Re-enter the existing Billing-owned webhook command; its receipt uniqueness
      // and domain transaction remain authoritative. No payload is stored here.
      await this.moduleRef.get(BillingService, { strict: false }).handleWebhook(event);
      return;
    }
    const common = await this.prisma.billingCombinedMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_COMBINED_BOUNDARY_ID }, select: { metricsStartAt: true },
    });
    if (claimed.component === BillingEvidenceComponent.stripe_fee) {
      const retrievedDispute = isDisputeMovementEvent(event.type) && claimed.providerReference
        ? await this.stripe.retrieveDispute(claimed.providerReference) : undefined;
      const prepared = await this.stripeFees.prepare(event, retrievedDispute);
      const transaction = prepared?.balanceTransaction;
      if (!transaction || prepared?.missingFee || !Number.isSafeInteger(transaction.fee)) return;
      if (!Number.isSafeInteger(transaction.created) || transaction.created <= 0) return;
      const effectiveAt = new Date(transaction.created * 1000);
      if (!Number.isFinite(effectiveAt.getTime())) return;
      await this.prisma.$transaction(async (tx) => {
        if (!await this.ownsLease(tx, claimed)) return;
        const feeBoundary = await tx.billingStripeFeeMetricsBoundary.findUniqueOrThrow({
          where: { id: BILLING_STRIPE_FEE_BOUNDARY_ID }, select: { metricsStartAt: true },
        });
        if (transaction.currency.toLowerCase() !== 'usd') {
          await this.resolve(tx, claimed, BillingEvidenceState.excluded_non_usd, effectiveAt);
        } else if (effectiveAt < feeBoundary.metricsStartAt || transaction.fee === 0) {
          await this.resolve(tx, claimed,
            effectiveAt < common.metricsStartAt || effectiveAt < feeBoundary.metricsStartAt
              ? BillingEvidenceState.excluded_pre_boundary : BillingEvidenceState.resolved_zero,
            effectiveAt);
        } else {
          const inserted = await tx.billingStripeFeeEffect.createMany({
            data: [{ sourceStripeEventId: event.id, balanceTransactionId: transaction.id,
              feeMinor: BigInt(transaction.fee), currency: 'usd', effectiveAt }],
            skipDuplicates: true,
          });
          if (inserted.count === 1) {
            const day = new Date(Date.UTC(effectiveAt.getUTCFullYear(), effectiveAt.getUTCMonth(), effectiveAt.getUTCDate()));
            await tx.billingDailyStripeFeeMetric.upsert({
              where: { day_currency: { day, currency: 'usd' } },
              create: { day, currency: 'usd', feeMinor: BigInt(transaction.fee), feeEffectCount: 1 },
              update: { feeMinor: { increment: BigInt(transaction.fee) }, feeEffectCount: { increment: 1 } },
            });
          } else {
            const existing = await tx.billingStripeFeeEffect.findUniqueOrThrow({
              where: { balanceTransactionId: transaction.id },
              select: { feeMinor: true, currency: true, effectiveAt: true },
            });
            if (existing.feeMinor !== BigInt(transaction.fee) || existing.currency !== 'usd' ||
              existing.effectiveAt.getTime() !== effectiveAt.getTime()) {
              throw new Error('Conflicting authoritative fee evidence');
            }
          }
          await this.resolve(tx, claimed, effectiveAt < common.metricsStartAt
            ? BillingEvidenceState.excluded_pre_boundary
            : inserted.count === 1 ? BillingEvidenceState.resolved_effect
              : BillingEvidenceState.excluded_duplicate, effectiveAt);
        }
      });
      return;
    }
    if (!isDisputeMovementEvent(event.type) || !claimed.providerReference) return;
    const dispute = await this.stripe.retrieveDispute(claimed.providerReference);
    if (dispute.id !== claimed.providerReference) return;
    const movement = selectDisputeMovement(dispute, event.type);
    if (!movement) return;
    const effectiveAt = new Date(movement.created * 1000);
    if (!Number.isFinite(effectiveAt.getTime())) return;
    await this.prisma.$transaction(async (tx) => {
      if (!await this.ownsLease(tx, claimed)) return;
      const disputeBoundary = await tx.billingDisputeMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_DISPUTE_METRICS_BOUNDARY_ID }, select: { metricsStartAt: true },
      });
      if (movement.currency.toLowerCase() !== 'usd' || dispute.currency.toLowerCase() !== 'usd') {
        await this.resolve(tx, claimed, BillingEvidenceState.excluded_non_usd, effectiveAt);
        return;
      }
      if (effectiveAt < disputeBoundary.metricsStartAt) {
        await this.resolve(tx, claimed, BillingEvidenceState.excluded_pre_boundary, effectiveAt);
        return;
      }
      const observation = await tx.billingDisputeObservation.findUnique({
        where: { sourceStripeEventId: event.id }, select: { disputeId: true },
      });
      if (!observation) return;
      const kind = event.type === 'charge.dispute.funds_withdrawn'
        ? BillingDisputeMovementKind.withdrawal : BillingDisputeMovementKind.reinstatement;
      const inserted = await tx.billingDisputeEffect.createMany({
        data: [{ disputeId: observation.disputeId, sourceStripeEventId: event.id,
          balanceTransactionId: movement.id, kind, amountMinor: BigInt(movement.amount),
          currency: 'usd', effectiveAt }], skipDuplicates: true,
      });
      if (inserted.count === 1) {
        const day = new Date(Date.UTC(effectiveAt.getUTCFullYear(), effectiveAt.getUTCMonth(), effectiveAt.getUTCDate()));
        await tx.billingDailyDisputeMetric.upsert({
          where: { day_currency: { day, currency: 'usd' } },
          create: { day, currency: 'usd',
            withdrawnMinor: kind === BillingDisputeMovementKind.withdrawal ? BigInt(movement.amount) : 0n,
            reinstatedMinor: kind === BillingDisputeMovementKind.reinstatement ? BigInt(movement.amount) : 0n,
            withdrawalCount: kind === BillingDisputeMovementKind.withdrawal ? 1 : 0,
            reinstatementCount: kind === BillingDisputeMovementKind.reinstatement ? 1 : 0 },
          update: kind === BillingDisputeMovementKind.withdrawal
            ? { withdrawnMinor: { increment: BigInt(movement.amount) }, withdrawalCount: { increment: 1 } }
            : { reinstatedMinor: { increment: BigInt(movement.amount) }, reinstatementCount: { increment: 1 } },
        });
      } else {
        const existing = await tx.billingDisputeEffect.findFirst({
          where: { OR: [{ disputeId: observation.disputeId, kind }, { balanceTransactionId: movement.id }] },
          select: { balanceTransactionId: true, amountMinor: true, effectiveAt: true },
        });
        if (!existing || existing.balanceTransactionId !== movement.id ||
          existing.amountMinor !== BigInt(movement.amount) ||
          existing.effectiveAt.getTime() !== effectiveAt.getTime()) {
          throw new Error('Conflicting authoritative dispute evidence');
        }
      }
      await this.resolve(tx, claimed, effectiveAt < common.metricsStartAt
        ? BillingEvidenceState.excluded_pre_boundary
        : inserted.count === 1 ? BillingEvidenceState.resolved_effect
          : BillingEvidenceState.excluded_duplicate, effectiveAt);
    });
  }

  private async ownsLease(tx: Prisma.TransactionClient, claimed: Claimed): Promise<boolean> {
    return (await tx.billingFinancialEvidenceCase.count({
      where: { id: claimed.id, state: BillingEvidenceState.pending,
        fencingToken: claimed.fencingToken, leaseExpiresAt: { gt: new Date() } },
    })) === 1;
  }

  private async resolve(
    tx: Prisma.TransactionClient, claimed: Claimed,
    state: Exclude<BillingEvidenceState, 'pending'>, effectiveAt: Date,
  ): Promise<void> {
    if (!await this.completeness.resolveInTransaction(tx, claimed.sourceStripeEventId,
      claimed.component, state, effectiveAt, claimed.fencingToken)) {
      throw new Error('Financial evidence lease was lost');
    }
  }
}

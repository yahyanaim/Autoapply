import { Injectable, Optional } from '@nestjs/common';
import {
  BillingEvidenceComponent,
  BillingEvidenceState,
  BillingDisputeObservationResolution,
  BillingStripeFeeResolution,
  Prisma,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';
import { isDisputeMovementEvent } from './billing-dispute-movement';
import type { PreparedStripeFee } from './billing-stripe-fee.service';

export const BILLING_COMBINED_BOUNDARY_ID = 'combined_financial_v1';
const DAY_MS = 86_400_000;
const MAX_DAYS = 90;
export const MAX_EVIDENCE_ATTEMPTS = 5;
export const EVIDENCE_LEASE_MS = 30_000;

function reference(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id;
  return null;
}

@Injectable()
export class BillingFinancialCompletenessService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  /** The Stripe controller has already verified the signature at this point. */
  async begin(event: Stripe.Event): Promise<void> {
    const data = event.data.object as unknown as Record<string, unknown>;
    const components: Array<{ component: BillingEvidenceComponent; providerReference: string | null }> = [];
    let feeReference: string | null = null;
    if (event.type === 'invoice.payment_succeeded') feeReference = reference(data.payment_intent);
    else if (event.type === 'charge.succeeded' || event.type === 'charge.updated') feeReference = reference(data.id);
    else if (event.type === 'refund.created' || event.type === 'refund.updated') feeReference = reference(data.id);
    else if (isDisputeMovementEvent(event.type)) feeReference = reference(data.id);
    else return;
    components.push({ component: BillingEvidenceComponent.stripe_fee, providerReference: feeReference });
    if (isDisputeMovementEvent(event.type)) {
      components.push({ component: BillingEvidenceComponent.dispute_movement,
        providerReference: reference(data.id) });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const boundary = await tx.billingCombinedMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_COMBINED_BOUNDARY_ID }, select: { metricsStartAt: true },
      });
      if (now < boundary.metricsStartAt) throw new Error('Financial evidence capture is not active');
      await tx.billingCombinedMetricsBoundary.updateMany({
        where: { id: BILLING_COMBINED_BOUNDARY_ID, captureActivatedAt: null },
        data: { captureActivatedAt: now },
      });
      await tx.billingFinancialEvidenceCase.createMany({
        data: components.map(({ component, providerReference }) => ({
          sourceStripeEventId: event.id,
          component,
          eventType: event.type,
          providerReference: providerReference && /^(?:pi|ch|re|du)_[A-Za-z0-9]+$/.test(providerReference)
            ? providerReference : null,
          nextAttemptAt: now,
        })),
        skipDuplicates: true,
      });
    });
  }

  async completeInTransaction(
    tx: Prisma.TransactionClient,
    sourceStripeEventId: string,
    feeEvidence: PreparedStripeFee | null | undefined,
  ): Promise<void> {
    const fee = await tx.billingStripeFeeObservation.findUnique({
      where: { sourceStripeEventId }, select: { resolution: true },
    });
    if (fee) {
      const mapping: Partial<Record<BillingStripeFeeResolution, Exclude<BillingEvidenceState, 'pending'>>> = {
        recorded: BillingEvidenceState.resolved_effect,
        zero_fee: BillingEvidenceState.resolved_zero,
        duplicate_balance_transaction: BillingEvidenceState.excluded_duplicate,
        unsupported_currency: BillingEvidenceState.excluded_non_usd,
        pre_boundary: BillingEvidenceState.excluded_pre_boundary,
      };
      const state = mapping[fee.resolution];
      if (state) {
        const at = feeEvidence?.balanceTransaction
          ? new Date(feeEvidence.balanceTransaction.created * 1000) : null;
        await this.resolveInTransaction(tx, sourceStripeEventId,
          BillingEvidenceComponent.stripe_fee, state, at);
      }
    }
    const dispute = await tx.billingDisputeObservation.findUnique({
      where: { sourceStripeEventId }, select: { resolution: true },
    });
    if (dispute) {
      const mapping: Partial<Record<BillingDisputeObservationResolution, Exclude<BillingEvidenceState, 'pending'>>> = {
        movement_recorded: BillingEvidenceState.resolved_effect,
        duplicate_movement: BillingEvidenceState.excluded_duplicate,
        unsupported_currency: BillingEvidenceState.excluded_non_usd,
        pre_boundary: BillingEvidenceState.excluded_pre_boundary,
      };
      const state = mapping[dispute.resolution];
      if (state) {
        const effect = await tx.billingDisputeEffect.findUnique({
          where: { sourceStripeEventId }, select: { effectiveAt: true },
        });
        await this.resolveInTransaction(tx, sourceStripeEventId,
          BillingEvidenceComponent.dispute_movement, state, effect?.effectiveAt ?? null);
      }
    }
  }

  async resolveInTransaction(
    tx: Prisma.TransactionClient,
    sourceStripeEventId: string,
    component: BillingEvidenceComponent,
    state: Exclude<BillingEvidenceState, 'pending'>,
    effectiveAt: Date | null,
    fencingToken?: number,
  ): Promise<boolean> {
    const evidenceCase = await tx.billingFinancialEvidenceCase.findUnique({
      where: { sourceStripeEventId_component: { sourceStripeEventId, component } },
      select: { id: true, fencingToken: true },
    });
    if (!evidenceCase || (fencingToken !== undefined && evidenceCase.fencingToken !== fencingToken)) return false;
    const updated = await tx.billingFinancialEvidenceCase.updateMany({
      where: { id: evidenceCase.id, state: BillingEvidenceState.pending,
        ...(fencingToken === undefined ? {} : { fencingToken, leaseExpiresAt: { gt: new Date() } }) },
      data: { state, effectiveAt, leaseExpiresAt: null },
    });
    if (updated.count !== 1) return false;
    await tx.billingEvidenceResolution.create({
      data: { caseId: evidenceCase.id, state, effectiveAt },
    });
    return true;
  }

  async claimDue(now = new Date()) {
    const candidates = await this.prisma.billingFinancialEvidenceCase.findMany({
      where: { state: BillingEvidenceState.pending, attempts: { lt: MAX_EVIDENCE_ATTEMPTS },
        nextAttemptAt: { lte: now }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }], take: 10,
      select: { id: true, sourceStripeEventId: true, component: true, eventType: true,
        providerReference: true, fencingToken: true, attempts: true },
    });
    const claimed: typeof candidates = [];
    for (const candidate of candidates) {
      const updated = await this.prisma.billingFinancialEvidenceCase.updateMany({
        where: { id: candidate.id, state: BillingEvidenceState.pending,
          attempts: candidate.attempts, fencingToken: candidate.fencingToken,
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
        data: { attempts: { increment: 1 }, fencingToken: { increment: 1 },
          leaseExpiresAt: new Date(now.getTime() + EVIDENCE_LEASE_MS),
          nextAttemptAt: new Date(now.getTime() + Math.min(60_000 * 2 ** candidate.attempts, 3_600_000)) },
      });
      if (updated.count === 1) claimed.push({ ...candidate, fencingToken: candidate.fencingToken + 1 });
    }
    return claimed;
  }

  async releaseClaim(id: string, fencingToken: number): Promise<void> {
    await this.prisma.billingFinancialEvidenceCase.updateMany({
      where: { id, fencingToken, state: BillingEvidenceState.pending },
      data: { leaseExpiresAt: null },
    });
  }

  async getCoverage(input: { from: Date; toExclusive: Date }) {
    const duration = input.toExclusive.getTime() - input.from.getTime();
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DAYS * DAY_MS ||
      input.from.getTime() % DAY_MS !== 0 || input.toExclusive.getTime() % DAY_MS !== 0) {
      throw new Error('Invalid financial evidence UTC range');
    }
    const asOf = this.clock.now();
    const boundary = await this.prisma.billingCombinedMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_COMBINED_BOUNDARY_ID },
      select: { metricsStartAt: true, captureActivatedAt: true, currency: true },
    });
    if (boundary.currency !== 'usd') throw new Error('Unsupported financial evidence currency');
    const activeFrom = boundary.captureActivatedAt && boundary.captureActivatedAt > boundary.metricsStartAt
      ? boundary.captureActivatedAt : boundary.metricsStartAt;
    const from = input.from > activeFrom ? input.from : activeFrom;
    const toExclusive = input.toExclusive < asOf ? input.toExclusive : asOf;
    const actualCoveredRange = boundary.captureActivatedAt && from < toExclusive
      ? { from, toExclusive } : null;
    // Unknown effective time can belong to any requested financial day.
    const unresolved = actualCoveredRange ? await this.prisma.billingFinancialEvidenceCase.count({
      where: { state: BillingEvidenceState.pending,
        OR: [{ effectiveAt: null }, { effectiveAt: { gte: from, lt: toExclusive } }] },
    }) : 0;
    const evidencedZeroCount = actualCoveredRange ? await this.prisma.billingFinancialEvidenceCase.count({
      where: { state: BillingEvidenceState.resolved_zero,
        effectiveAt: { gte: from, lt: toExclusive } },
    }) : 0;
    return {
      boundary: boundary.metricsStartAt, activationAt: boundary.captureActivatedAt,
      asOf, requestedRange: input, actualCoveredRange,
      status: !actualCoveredRange ? 'unavailable' as const
        : unresolved > 0 ? 'unresolved' as const
          : input.from < from || input.toExclusive > asOf ? 'partial' as const : 'full' as const,
      unresolvedCaseCount: unresolved, evidencedZeroCount,
    };
  }
}

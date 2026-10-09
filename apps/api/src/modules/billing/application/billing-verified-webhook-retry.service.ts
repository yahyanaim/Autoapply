import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingEvidenceComponent,
  BillingEvidenceState,
  BillingVerifiedWebhookReason,
  BillingVerifiedWebhookState,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { MAX_EVIDENCE_ATTEMPTS } from './billing-financial-completeness.service';

// Stripe guarantees retrieval of a v1 Event for 30 days. The local 29-day
// signed event-creation bound leaves room for dispatch, but provider availability is
// still checked by the existing Billing evidence worker at execution time.
const REQUEST_WINDOW_MS = 29 * 86_400_000;
const EVENT_ID = /^evt_[A-Za-z0-9]+$/;
const RETRYABLE_TYPES = new Set([
  'invoice.payment_succeeded', 'charge.succeeded', 'charge.updated',
  'refund.created', 'refund.updated',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated',
]);

type Delivery = {
  id: string;
  eventId: string;
  eventType: string;
  eventCreatedAt: Date | null;
  state: BillingVerifiedWebhookState;
  reason: BillingVerifiedWebhookReason | null;
  observedAt: Date;
  resolvedAt: Date | null;
};

export interface VerifiedWebhookRetryResult {
  deliveryId: string;
  status: 'retry_requested';
  requestedAt: Date;
}

export class VerifiedWebhookRetryReplay extends Error {}
export class VerifiedWebhookRetryPersistenceConflict extends Error {}

@Injectable()
export class BillingVerifiedWebhookRetryService {
  constructor(private readonly prisma: PrismaService) {}

  async describePage(rows: Delivery[]): Promise<Map<string, {
    retryEligible: boolean;
    retryStatus: 'none' | 'pending' | 'processed' | 'needs_review';
  }>> {
    const eventIds = [...new Set(rows.map((row) => row.eventId))];
    if (!eventIds.length) return new Map();
    const [cases, receipts] = await Promise.all([
      this.prisma.billingFinancialEvidenceCase.findMany({
        where: { sourceStripeEventId: { in: eventIds }, component: BillingEvidenceComponent.stripe_fee },
        select: { sourceStripeEventId: true, eventType: true, state: true, attempts: true,
          leaseExpiresAt: true, adminRetryDeliveryId: true, adminRetryKeyHash: true },
      }),
      this.prisma.stripeWebhookEvent.findMany({
        where: { eventId: { in: eventIds } }, select: { eventId: true },
      }),
    ]);
    const byEvent = new Map(cases.map((item) => [item.sourceStripeEventId, item]));
    const processed = new Set(receipts.map((item) => item.eventId));
    const now = new Date();
    return new Map(rows.map((row) => {
      const evidence = byEvent.get(row.eventId);
      const hasReceipt = processed.has(row.eventId);
      const requestedForThisDelivery = evidence?.adminRetryDeliveryId === row.id;
      const retryStatus = requestedForThisDelivery
        ? hasReceipt ? 'processed' as const
          : evidence.attempts >= MAX_EVIDENCE_ATTEMPTS ? 'needs_review' as const
            : 'pending' as const
        : 'none' as const;
      return [row.id, {
        retryEligible: this.eligible(row, evidence, hasReceipt, now),
        retryStatus,
      }];
    }));
  }

  async requestInTransaction(tx: Prisma.TransactionClient, input: {
    deliveryId: string;
    actorUserId: string;
    idempotencyKey: string;
    now: Date;
  }) {
    const keyHash = this.hash(`${input.actorUserId}\0${input.idempotencyKey}`);
    const fingerprint = this.hash(`admin.webhook.retry\0${input.deliveryId}`);
    const replay = await tx.billingFinancialEvidenceCase.findUnique({
      where: { adminRetryKeyHash: keyHash },
      select: { adminRetryFingerprint: true },
    });
    if (replay) {
      if (replay.adminRetryFingerprint !== fingerprint) {
        throw new ConflictException('Idempotency-Key was used for another request');
      }
      throw new VerifiedWebhookRetryReplay();
    }

    const delivery = await tx.billingVerifiedWebhookDelivery.findUnique({
      where: { id: input.deliveryId },
      select: { id: true, eventId: true, eventType: true, eventCreatedAt: true, state: true,
        reason: true, observedAt: true, resolvedAt: true },
    });
    if (!delivery) throw new NotFoundException('Verified delivery not found');
    const evidence = await tx.billingFinancialEvidenceCase.findUnique({
      where: { sourceStripeEventId_component: {
        sourceStripeEventId: delivery.eventId, component: BillingEvidenceComponent.stripe_fee,
      } },
      select: { id: true, eventType: true, state: true, attempts: true, leaseExpiresAt: true,
        fencingToken: true, adminRetryKeyHash: true },
    });
    const receipt = await tx.stripeWebhookEvent.findUnique({
      where: { eventId: delivery.eventId }, select: { id: true },
    });
    if (!this.eligible(delivery, evidence, !!receipt, input.now)) {
      throw new ConflictException('Verified delivery is not retryable');
    }
    const updated = await tx.billingFinancialEvidenceCase.updateMany({
      where: { id: evidence!.id, state: BillingEvidenceState.pending,
        attempts: { lt: MAX_EVIDENCE_ATTEMPTS }, fencingToken: evidence!.fencingToken,
        adminRetryKeyHash: null,
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: input.now } }] },
      data: { nextAttemptAt: input.now, adminRetryDeliveryId: delivery.id,
        adminRetryKeyHash: keyHash, adminRetryFingerprint: fingerprint,
        adminRetryRequestedAt: input.now },
    });
    if (updated.count !== 1) throw new VerifiedWebhookRetryPersistenceConflict();
    return {
      value: this.result(delivery.id, input.now),
      before: { status: 'failed' },
      after: { status: 'retry_requested' },
    };
  }

  async resolveIdempotentResult(input: {
    deliveryId: string;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<VerifiedWebhookRetryResult> {
    const evidence = await this.prisma.billingFinancialEvidenceCase.findUnique({
      where: { adminRetryKeyHash: this.hash(`${input.actorUserId}\0${input.idempotencyKey}`) },
      select: { adminRetryDeliveryId: true, adminRetryFingerprint: true,
        adminRetryRequestedAt: true },
    });
    if (!evidence || evidence.adminRetryFingerprint !== this.hash(`admin.webhook.retry\0${input.deliveryId}`) ||
      evidence.adminRetryDeliveryId !== input.deliveryId || !evidence.adminRetryRequestedAt) {
      throw new ConflictException('Verified delivery retry conflicts with an existing request');
    }
    return this.result(input.deliveryId, evidence.adminRetryRequestedAt);
  }

  private eligible(row: Delivery, evidence: {
    eventType: string;
    state: BillingEvidenceState;
    attempts: number;
    leaseExpiresAt: Date | null;
    adminRetryKeyHash: string | null;
  } | null | undefined, hasReceipt: boolean, now: Date): boolean {
    const age = row.eventCreatedAt ? now.getTime() - row.eventCreatedAt.getTime() : NaN;
    return row.state === BillingVerifiedWebhookState.retryable_failure &&
      row.reason === BillingVerifiedWebhookReason.provider_unavailable &&
      row.resolvedAt === null && !hasReceipt &&
      RETRYABLE_TYPES.has(row.eventType) && EVENT_ID.test(row.eventId) &&
      evidence?.eventType === row.eventType &&
      age >= 0 && age < REQUEST_WINDOW_MS &&
      evidence?.state === BillingEvidenceState.pending &&
      evidence.attempts < MAX_EVIDENCE_ATTEMPTS &&
      evidence.adminRetryKeyHash === null &&
      (!evidence.leaseExpiresAt || evidence.leaseExpiresAt <= now);
  }

  private result(deliveryId: string, requestedAt: Date): VerifiedWebhookRetryResult {
    return { deliveryId, status: 'retry_requested', requestedAt };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}

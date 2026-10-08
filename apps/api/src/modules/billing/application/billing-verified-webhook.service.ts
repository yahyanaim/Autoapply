import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  BillingVerifiedWebhookReason,
  BillingVerifiedWebhookState,
  Prisma,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BillingVerifiedWebhookRetryService } from './billing-verified-webhook-retry.service';

export const BILLING_VERIFIED_WEBHOOK_BOUNDARY_ID = 'verified_stripe_webhook_inspection_v1';
const RELEVANT_TYPES = new Set([
  'checkout.session.completed', 'invoice.payment_succeeded', 'invoice.payment_failed',
  'customer.subscription.updated', 'customer.subscription.deleted',
  'refund.created', 'refund.updated', 'charge.succeeded', 'charge.updated',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated',
]);
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_DAYS = 90;

function day(value: string): Date {
  if (!UTC_DAY.test(value)) throw new BadRequestException('Invalid UTC range');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Invalid UTC range');
  }
  return parsed;
}

@Injectable()
export class BillingVerifiedWebhookService {
  constructor(private readonly prisma: PrismaService,
    @Optional() private readonly retries?: BillingVerifiedWebhookRetryService) {}

  // Called only after constructWebhookEvent has verified the signature. The
  // event payload, signature and provider error are never persisted here.
  async beginVerified(event: Stripe.Event): Promise<{ id: string } | null> {
    if (!RELEVANT_TYPES.has(event.type)) return null;
    const createdMs = Number.isSafeInteger(event.created) && event.created > 0
      ? event.created * 1000 : NaN;
    const eventCreatedAt = Number.isFinite(createdMs) && createdMs <= 8_640_000_000_000_000
      ? new Date(createdMs) : null;
    const row = await this.prisma.billingVerifiedWebhookDelivery.create({
      data: { eventId: event.id, eventType: event.type, eventCreatedAt, observedAt: new Date() },
      select: { id: true },
    });
    return { id: row.id };
  }

  async fail(id: string, eventId: string, error: unknown): Promise<void> {
    const retryable = error instanceof Stripe.errors.StripeConnectionError ||
      error instanceof Stripe.errors.StripeRateLimitError;
    const state = retryable
      ? BillingVerifiedWebhookState.retryable_failure
      : BillingVerifiedWebhookState.unclassified_failure;
    const reason = retryable
      ? BillingVerifiedWebhookReason.provider_unavailable
      : BillingVerifiedWebhookReason.processing_error;
    // This delivery's outcome is independent of another delivery's receipt.
    // A successful concurrent delivery never completes this attempt for it.
    await this.prisma.billingVerifiedWebhookDelivery.updateMany({
      where: { id, eventId, state: BillingVerifiedWebhookState.processing },
      data: { state, reason, finishedAt: new Date() },
    });
  }

  async resolveInTransaction(transaction: Prisma.TransactionClient, eventId: string,
    deliveryId?: string): Promise<void> {
    const now = new Date();
    // A later successful delivery resolves prior failures without rewriting
    // their attempt outcome, reason, or completion timestamp.
    await transaction.billingVerifiedWebhookDelivery.updateMany({
      where: { eventId, state: { in: [BillingVerifiedWebhookState.retryable_failure,
        BillingVerifiedWebhookState.unclassified_failure] }, resolvedAt: null },
      data: { resolvedAt: now },
    });
    if (deliveryId) await transaction.billingVerifiedWebhookDelivery.updateMany({
      where: { id: deliveryId, eventId, state: BillingVerifiedWebhookState.processing },
      data: { state: BillingVerifiedWebhookState.resolved, resolvedAt: now, finishedAt: now },
    });
  }

  async resolve(eventId: string, deliveryId?: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.resolveInTransaction(transaction, eventId, deliveryId);
    });
  }

  async list(input: { from: string; to: string; cursor?: string; limit?: number;
    state?: 'unresolved' | 'retryable' | 'resolved' }) {
    const from = day(input.from);
    const toExclusive = new Date(day(input.to).getTime() + DAY_MS);
    const days = (toExclusive.getTime() - from.getTime()) / DAY_MS;
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      throw new BadRequestException('Choose 1 to 90 inclusive UTC days');
    }
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new BadRequestException('Invalid limit');
    const boundary = await this.prisma.billingVerifiedWebhookBoundary.findUniqueOrThrow({
      where: { id: BILLING_VERIFIED_WEBHOOK_BOUNDARY_ID }, select: { startsAt: true },
    });
    const asOf = new Date();
    const coveredFrom = new Date(Math.max(from.getTime(), boundary.startsAt.getTime()));
    const coveredTo = new Date(Math.min(toExclusive.getTime(), asOf.getTime()));
    const coveredRange = coveredFrom < coveredTo
      ? { from: coveredFrom.toISOString(), toExclusive: coveredTo.toISOString() } : null;
    let cursorTime: Date | undefined;
    if (input.cursor) {
      const cursor = await this.prisma.billingVerifiedWebhookDelivery.findUnique({
        where: { id: input.cursor }, select: { observedAt: true },
      });
      if (!cursor) throw new BadRequestException('Invalid cursor');
      cursorTime = cursor.observedAt;
    }
    const where: Prisma.BillingVerifiedWebhookDeliveryWhereInput = {
      observedAt: { gte: coveredFrom, lt: coveredTo },
      ...(input.state === 'retryable' ? {
        state: BillingVerifiedWebhookState.retryable_failure, resolvedAt: null,
      } : input.state === 'resolved' ? {
        reason: { not: null }, resolvedAt: { not: null },
      } : input.state === 'unresolved' ? {
        state: { in: [BillingVerifiedWebhookState.processing,
          BillingVerifiedWebhookState.unclassified_failure] }, resolvedAt: null,
      } : { OR: [{ state: BillingVerifiedWebhookState.processing }, { reason: { not: null } }] }),
      ...(cursorTime && input.cursor ? { AND: [{ OR: [
        { observedAt: { lt: cursorTime } },
        { observedAt: cursorTime, id: { lt: input.cursor } },
      ] }] } : {}),
    };
    const rows = coveredRange ? await this.prisma.billingVerifiedWebhookDelivery.findMany({
      where, orderBy: [{ observedAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      select: { id: true, eventId: true, eventType: true, eventCreatedAt: true, state: true, reason: true,
        observedAt: true, finishedAt: true, resolvedAt: true },
    }) : [];
    const page = rows.slice(0, limit);
    const retryStates = this.retries ? await this.retries.describePage(page) : new Map();
    return {
      coverage: !coveredRange ? 'unavailable' as const
        : coveredFrom > from || coveredTo < toExclusive ? 'partial' as const : 'covered' as const,
      coverageStartAt: boundary.startsAt.toISOString(),
      requestedRange: { from: from.toISOString(), toExclusive: toExclusive.toISOString() },
      coveredRange, asOf: asOf.toISOString(), limit,
      items: page.map((row) => ({
        id: row.id, eventType: row.eventType,
        status: row.resolvedAt ? 'resolved' as const
          : row.state === BillingVerifiedWebhookState.retryable_failure ? 'retryable' as const
            : 'unresolved' as const,
        reason: row.reason ?? 'processing_outcome_unknown' as const,
        observedAt: row.observedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        retryEligible: retryStates.get(row.id)?.retryEligible ?? false,
        retryStatus: retryStates.get(row.id)?.retryStatus ?? 'none',
      })),
      nextCursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
    };
  }
}

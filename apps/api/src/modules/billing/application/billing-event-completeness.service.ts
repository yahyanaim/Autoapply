import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingEventScanFinding,
  BillingEventScanStatus,
  BillingEvidenceState,
  BillingInvoiceFinancialOutcomeStatus,
  BillingRefundStatus,
  BillingStripeFeeResolution,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { StripeAdapter } from '../infrastructure/stripe/stripe.adapter';
import { isDisputeMovementEvent } from './billing-dispute-movement';
import {
  BILLING_FINANCIAL_METRICS_BOUNDARY_ID,
  BILLING_REFUND_METRICS_BOUNDARY_ID,
} from './billing-financial-metrics-recorder.service';

export const BILLING_EVENT_SCAN_BOUNDARY_ID = 'stripe_financial_events_v1';
export const SUPPORTED_FINANCIAL_EVENT_TYPES = [
  'invoice.payment_succeeded', 'invoice.payment_failed',
  'charge.succeeded', 'charge.updated',
  'refund.created', 'refund.updated',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated',
] as const;
const supported = new Set<string>(SUPPORTED_FINANCIAL_EVENT_TYPES);
const DAY_MS = 86_400_000;
const MAX_SCAN_DAYS = 7;
const PROVIDER_SAFE_DAYS = 29; // Stripe advertises up to 30 days; leave a margin.
const PAGE_SIZE = 100;
const MAX_PROVIDER_PAGES = 5;
const MAX_FINDINGS_PAGE = 20;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;

interface ProviderEvent {
  id: string;
  type: string;
  created: number;
  currency: string | null;
}

function utcDay(value: string): Date {
  if (!UTC_DAY.test(value)) throw new BadRequestException('Invalid UTC scan range');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Invalid UTC scan range');
  }
  return date;
}

/** Read-only financial comparison: writes scan evidence, never financial effects. */
@Injectable()
export class BillingEventCompletenessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeAdapter,
  ) {}

  async scan(input: { from: string; to: string }) {
    const from = utcDay(input.from);
    const toExclusive = new Date(utcDay(input.to).getTime() + DAY_MS);
    const days = (toExclusive.getTime() - from.getTime()) / DAY_MS;
    if (days < 1 || days > MAX_SCAN_DAYS) {
      throw new BadRequestException('Scan range must contain 1 to 7 UTC days');
    }

    // The last complete provider second is the event-created cutoff. Each
    // comparison page has its own local database snapshot, not one scan-wide
    // atomic Stripe/PostgreSQL snapshot.
    const asOf = new Date(Math.floor(Date.now() / 1000) * 1000);
    const boundary = await this.prisma.billingEventScanBoundary.findUniqueOrThrow({
      where: { id: BILLING_EVENT_SCAN_BOUNDARY_ID }, select: { startsAt: true },
    });
    const scan = await this.prisma.billingEventScan.create({
      data: { from, toExclusive, asOf, status: BillingEventScanStatus.incomplete },
      select: { id: true },
    });
    const earliest = new Date(asOf.getTime() - PROVIDER_SAFE_DAYS * DAY_MS);
    const effectiveFrom = new Date(Math.max(from.getTime(), boundary.startsAt.getTime()));
    const effectiveTo = new Date(Math.min(toExclusive.getTime(), asOf.getTime()));
    if (from < earliest || effectiveFrom >= effectiveTo) {
      await this.finish(scan.id, BillingEventScanStatus.unavailable,
        from < earliest ? 'provider_window_unavailable' : 'no_active_interval', 0, null);
      return scan.id;
    }

    await this.prisma.billingEventScan.update({
      where: { id: scan.id },
      data: { attemptedFrom: effectiveFrom, attemptedToExclusive: effectiveTo },
    });

    const partial = effectiveFrom > from || effectiveTo < toExclusive;
    let count = 0;
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    const seenEvents = new Set<string>();
    try {
      for (let pageNumber = 0; pageNumber < MAX_PROVIDER_PAGES; pageNumber++) {
        const page = await this.stripe.listFinancialEvents({
          fromSeconds: Math.ceil(effectiveFrom.getTime() / 1000),
          throughSeconds: Math.ceil(effectiveTo.getTime() / 1000) - 1,
          types: [...SUPPORTED_FINANCIAL_EVENT_TYPES],
          startingAfter: cursor ?? undefined,
          limit: PAGE_SIZE,
        });
        if (page.events.length > PAGE_SIZE || (page.hasMore && page.events.length === 0) ||
          page.events.some((event) => !this.validProviderEvent(event, effectiveFrom, effectiveTo) ||
            seenEvents.has(event.id)) || new Set(page.events.map((event) => event.id)).size !== page.events.length) {
          await this.finish(scan.id, BillingEventScanStatus.incomplete,
            'provider_page_invalid', count, cursor);
          return scan.id;
        }
        await this.comparePage(scan.id, page.events);
        page.events.forEach((event) => seenEvents.add(event.id));
        count += page.events.length;
        const last = page.events[page.events.length - 1];
        if (!page.hasMore) {
          await this.finish(scan.id, partial ? BillingEventScanStatus.incomplete : BillingEventScanStatus.completed,
            partial ? 'partial_window' : null, count, null, { from: effectiveFrom, toExclusive: effectiveTo });
          return scan.id;
        }
        if (!last || seenCursors.has(last.id)) {
          await this.finish(scan.id, BillingEventScanStatus.incomplete,
            'provider_cursor_invalid', count, cursor);
          return scan.id;
        }
        cursor = last.id;
        seenCursors.add(cursor);
      }
      await this.finish(scan.id, BillingEventScanStatus.incomplete, 'provider_page_cap', count, cursor);
    } catch {
      // Never leak provider or database errors through the Admin projection.
      await this.finish(scan.id, BillingEventScanStatus.failed, 'provider_or_comparison_failure', count, cursor);
    }
    return scan.id;
  }

  async getPage(input: {
    scanId: string; from: string; to: string; cursor?: string; limit?: number;
  }) {
    const from = utcDay(input.from);
    const toExclusive = new Date(utcDay(input.to).getTime() + DAY_MS);
    const limit = input.limit ?? MAX_FINDINGS_PAGE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FINDINGS_PAGE) {
      throw new BadRequestException('Invalid findings page size');
    }
    const scan = await this.prisma.billingEventScan.findUnique({
      where: { id: input.scanId },
      select: { id: true, from: true, toExclusive: true, asOf: true, status: true,
        attemptedFrom: true, attemptedToExclusive: true, verifiedFrom: true, verifiedToExclusive: true,
        reason: true, scannedCount: true, completedAt: true },
    });
    if (!scan || scan.from.getTime() !== from.getTime() ||
      scan.toExclusive.getTime() !== toExclusive.getTime()) {
      throw new NotFoundException('Financial completeness scan not found');
    }
    if (input.cursor) {
      const owned = await this.prisma.billingEventScanDiscrepancy.findFirst({
        where: { id: input.cursor, scanId: scan.id }, select: { id: true },
      });
      if (!owned) throw new BadRequestException('Invalid findings cursor');
    }
    const rows = await this.prisma.billingEventScanDiscrepancy.findMany({
      where: { scanId: scan.id },
      orderBy: [{ eventAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: { id: true, eventType: true, eventAt: true, finding: true },
    });
    const page = rows.slice(0, limit);
    return {
      scanId: scan.id,
      status: scan.status,
      reason: scan.reason,
      requestedRange: { from: scan.from.toISOString(), toExclusive: scan.toExclusive.toISOString() },
      attemptedRange: scan.attemptedFrom && scan.attemptedToExclusive ? {
        from: scan.attemptedFrom.toISOString(), toExclusive: scan.attemptedToExclusive.toISOString(),
      } : null,
      verifiedCoveredRange: scan.verifiedFrom && scan.verifiedToExclusive ? {
        from: scan.verifiedFrom.toISOString(), toExclusive: scan.verifiedToExclusive.toISOString(),
      } : null,
      asOf: scan.asOf.toISOString(),
      completedAt: scan.completedAt?.toISOString() ?? null,
      scannedEventCount: scan.scannedCount,
      findings: page.map((row) => ({
        id: row.id, eventType: row.eventType, eventAt: row.eventAt.toISOString(), finding: row.finding,
      })),
      limit,
      nextCursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
    };
  }

  private validProviderEvent(event: ProviderEvent, from: Date, toExclusive: Date): boolean {
    const at = event.created * 1000;
    return /^evt_[A-Za-z0-9]+$/.test(event.id) && supported.has(event.type) &&
      Number.isSafeInteger(event.created) && at >= from.getTime() && at < toExclusive.getTime();
  }

  private async comparePage(scanId: string, events: ProviderEvent[]): Promise<void> {
    if (events.length === 0) return;
    const ids = events.map((event) => event.id);
    // A webhook commits its receipt and evidence resolution atomically. Read
    // every local input from one snapshot so a page cannot combine a receipt
    // from before that commit with resolved evidence from after it. Stripe
    // listing is deliberately outside this short, bounded transaction.
    const { receipts, invoiceOutcomes, gross, refunds, disputes, fees, feeEffects,
      disputeEffects, evidence, grossBoundary, refundBoundary } = await this.prisma.$transaction(async (tx) => {
      const receipts = await tx.stripeWebhookEvent.findMany({
        where: { eventId: { in: ids } }, select: { eventId: true },
      });
      const [invoiceOutcomes, gross, refunds, disputes, fees, feeEffects, disputeEffects,
        evidence, grossBoundary, refundBoundary] = await Promise.all([
      tx.billingInvoiceFinancialOutcome.findMany({ where: { sourceStripeEventId: { in: ids } },
        select: { sourceStripeEventId: true, status: true } }),
      tx.billingFinancialEvent.findMany({ where: { sourceStripeEventId: { in: ids } }, select: { sourceStripeEventId: true } }),
      tx.billingRefundObservation.findMany({ where: { sourceStripeEventId: { in: ids } },
        select: { sourceStripeEventId: true, status: true, refund: {
          select: { currencySupport: true, firstSucceededAt: true, effect: { select: { id: true } } },
        } } }),
      tx.billingDisputeObservation.findMany({ where: { sourceStripeEventId: { in: ids } },
        select: { sourceStripeEventId: true, resolution: true } }),
      tx.billingStripeFeeObservation.findMany({ where: { sourceStripeEventId: { in: ids } },
        select: { sourceStripeEventId: true, resolution: true } }),
      tx.billingStripeFeeEffect.findMany({ where: { sourceStripeEventId: { in: ids } }, select: { sourceStripeEventId: true } }),
      tx.billingDisputeEffect.findMany({ where: { sourceStripeEventId: { in: ids } }, select: { sourceStripeEventId: true } }),
      tx.billingFinancialEvidenceCase.findMany({ where: { sourceStripeEventId: { in: ids } },
        select: { sourceStripeEventId: true, state: true } }),
      tx.billingFinancialMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID }, select: { metricsStartAt: true },
      }),
      tx.billingRefundMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_REFUND_METRICS_BOUNDARY_ID }, select: { metricsStartAt: true },
      }),
      ]);
      return { receipts, invoiceOutcomes, gross, refunds, disputes, fees, feeEffects,
        disputeEffects, evidence, grossBoundary, refundBoundary };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 2_000, timeout: 5_000 });
    const receiptIds = new Set(receipts.map((row) => row.eventId));
    const invoiceOutcomeByEvent = new Map(invoiceOutcomes.map((row) => [row.sourceStripeEventId, row.status]));
    const grossIds = new Set(gross.map((row) => row.sourceStripeEventId));
    const refundByEvent = new Map(refunds.map((row) => [row.sourceStripeEventId, row]));
    const disputeByEvent = new Map(disputes.map((row) => [row.sourceStripeEventId, row]));
    const feeByEvent = new Map(fees.map((row) => [row.sourceStripeEventId, row]));
    const feeEffectIds = new Set(feeEffects.map((row) => row.sourceStripeEventId));
    const disputeEffectIds = new Set(disputeEffects.map((row) => row.sourceStripeEventId));
    const pendingIds = new Set(evidence.filter((row) => row.state === BillingEvidenceState.pending)
      .map((row) => row.sourceStripeEventId));
    const findings: Array<{ scanId: string; sourceStripeEventId: string;
      eventType: string; eventAt: Date; finding: BillingEventScanFinding }> = [];
    const record = (event: ProviderEvent, finding: BillingEventScanFinding) => findings.push({
      scanId, sourceStripeEventId: event.id, eventType: event.type,
      eventAt: new Date(event.created * 1000), finding,
    });
    for (const event of events) {
      if (!receiptIds.has(event.id)) {
        record(event, pendingIds.has(event.id) ? BillingEventScanFinding.unresolved_evidence :
          BillingEventScanFinding.missing_receipt);
        continue;
      }
      if (pendingIds.has(event.id)) record(event, BillingEventScanFinding.unresolved_evidence);
      if (event.type === 'invoice.payment_succeeded' &&
        event.created * 1000 >= grossBoundary.metricsStartAt.getTime() &&
        event.currency?.toLowerCase() === 'usd' && !grossIds.has(event.id)) {
        const outcome = invoiceOutcomeByEvent.get(event.id);
        if (outcome === BillingInvoiceFinancialOutcomeStatus.eligible) {
          record(event, BillingEventScanFinding.missing_gross_effect);
        } else if (outcome !== BillingInvoiceFinancialOutcomeStatus.excluded_no_local_subscription &&
          !pendingIds.has(event.id)) {
          record(event, BillingEventScanFinding.unresolved_evidence);
        }
      }
      if (event.type === 'invoice.payment_succeeded' && event.currency === null) {
        record(event, BillingEventScanFinding.unresolved_evidence);
      }
      if (event.type.startsWith('refund.')) {
        const observation = refundByEvent.get(event.id);
        if (!observation) record(event, BillingEventScanFinding.missing_refund_observation);
        else if (observation.status === BillingRefundStatus.succeeded &&
          observation.refund.currencySupport === 'usd' &&
          observation.refund.firstSucceededAt &&
          observation.refund.firstSucceededAt >= refundBoundary.metricsStartAt &&
          !observation.refund.effect) {
          record(event, BillingEventScanFinding.missing_refund_effect);
        }
      }
      if (event.type.startsWith('charge.dispute.')) {
        const observation = disputeByEvent.get(event.id);
        if (!observation) record(event, BillingEventScanFinding.missing_dispute_observation);
        else if (observation.resolution === 'movement_recorded' && !disputeEffectIds.has(event.id)) {
          record(event, BillingEventScanFinding.missing_dispute_effect);
        } else if (observation.resolution === 'missing_authoritative_transaction' && !pendingIds.has(event.id)) {
          record(event, BillingEventScanFinding.unresolved_evidence);
        }
      }
      const feeEligible = event.type === 'invoice.payment_succeeded' ||
        event.type === 'charge.succeeded' || event.type === 'charge.updated' ||
        event.type === 'refund.created' || event.type === 'refund.updated' ||
        isDisputeMovementEvent(event.type);
      if (feeEligible) {
        const observation = feeByEvent.get(event.id);
        if (!observation && !pendingIds.has(event.id)) {
          record(event, BillingEventScanFinding.missing_fee_observation);
        } else if (observation?.resolution === BillingStripeFeeResolution.recorded &&
          !feeEffectIds.has(event.id)) {
          record(event, BillingEventScanFinding.missing_recorded_fee_effect);
        } else if (observation &&
          (observation.resolution === BillingStripeFeeResolution.missing_authoritative_fee ||
            observation.resolution === BillingStripeFeeResolution.missing_authoritative_transaction) &&
          !pendingIds.has(event.id)) {
          record(event, BillingEventScanFinding.unresolved_evidence);
        }
      }
    }
    if (findings.length > 0) {
      await this.prisma.billingEventScanDiscrepancy.createMany({ data: findings, skipDuplicates: true });
    }
  }

  private async finish(id: string, status: BillingEventScanStatus, reason: string | null,
    scannedCount: number, providerCursor: string | null,
    verified?: { from: Date; toExclusive: Date }): Promise<void> {
    await this.prisma.billingEventScan.update({
      where: { id }, data: { status, reason, scannedCount, providerCursor, completedAt: new Date(),
        ...(verified ? { verifiedFrom: verified.from, verifiedToExclusive: verified.toExclusive } : {}) },
    });
  }
}

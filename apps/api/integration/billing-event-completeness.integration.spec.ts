import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { BillingService } from '../src/modules/billing/application/billing.service';
import { BillingFinancialCompletenessService } from '../src/modules/billing/application/billing-financial-completeness.service';
import { BillingFinancialMetricsRecorderService, BILLING_FINANCIAL_METRICS_BOUNDARY_ID } from '../src/modules/billing/application/billing-financial-metrics-recorder.service';
import { SubscriptionLifecycleService } from '../src/modules/billing/application/subscription-lifecycle.service';
import {
  BillingEventCompletenessService, BILLING_EVENT_SCAN_BOUNDARY_ID,
} from '../src/modules/billing/application/billing-event-completeness.service';

const run = `scan${process.pid}${Date.now()}`;
const DAY_MS = 86_400_000;
const dayStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

describe('Billing event completeness PostgreSQL integration', () => {
  let prisma: PrismaService;
  let originalBoundary: Date;
  let originalGrossBoundary: Date;
  let day: Date;
  let dayText: string;
  let eventIds: string[];
  let scanIds: string[] = [];
  const stripe = { listFinancialEvents: jest.fn() };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) throw new Error('Isolated test DATABASE_URL required');
    prisma = new PrismaService();
    await prisma.$connect();
    const boundary = await prisma.billingEventScanBoundary.findUniqueOrThrow({
      where: { id: BILLING_EVENT_SCAN_BOUNDARY_ID },
    });
    originalBoundary = boundary.startsAt;
    originalGrossBoundary = (await prisma.billingFinancialMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID }, select: { metricsStartAt: true },
    })).metricsStartAt;
    expect(originalBoundary.getTime()).toBeLessThanOrEqual(Date.now());
    day = new Date(dayStart(new Date()).getTime() - DAY_MS);
    dayText = day.toISOString().slice(0, 10);
    eventIds = ['missing', 'processed', 'unresolved'].map((kind) => `evt_${run}${kind}`);
    // This shift is confined to the disposable test database; first assert the
    // migration's future-only boundary above, then exercise elapsed UTC days.
    await prisma.billingEventScanBoundary.update({
      where: { id: BILLING_EVENT_SCAN_BOUNDARY_ID }, data: { startsAt: day },
    });
    await prisma.billingFinancialMetricsBoundary.update({
      where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID }, data: { metricsStartAt: day },
    });
    await prisma.stripeWebhookEvent.createMany({ data: [
      { eventId: eventIds[1], type: 'invoice.payment_succeeded' },
      { eventId: eventIds[2], type: 'charge.updated' },
    ] });
    await prisma.billingFinancialEvent.create({ data: {
      sourceStripeEventId: eventIds[1], category: 'gross_revenue', amountMinor: 500n,
      currency: 'usd', effectiveAt: new Date(day.getTime() + 13 * 3_600_000),
    } });
    await prisma.billingStripeFeeObservation.create({ data: {
      sourceStripeEventId: eventIds[1], resolution: 'zero_fee',
    } });
    await prisma.billingFinancialEvidenceCase.create({ data: {
      sourceStripeEventId: eventIds[2], component: 'stripe_fee',
      eventType: 'charge.updated', state: 'pending',
    } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.billingEventScanDiscrepancy.deleteMany({ where: { scanId: { in: scanIds } } });
    await prisma.billingEventScan.deleteMany({ where: { id: { in: scanIds } } });
    const cases = await prisma.billingFinancialEvidenceCase.findMany({
      where: { sourceStripeEventId: { in: eventIds } }, select: { id: true },
    });
    await prisma.billingEvidenceResolution.deleteMany({ where: { caseId: { in: cases.map((item) => item.id) } } });
    await prisma.billingFinancialEvidenceCase.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.billingStripeFeeObservation.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.billingFinancialEvent.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.billingInvoiceFinancialOutcome.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.stripeWebhookEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.billingEventScanBoundary.update({
      where: { id: BILLING_EVENT_SCAN_BOUNDARY_ID }, data: { startsAt: originalBoundary },
    });
    await prisma.billingFinancialMetricsBoundary.update({
      where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID }, data: { metricsStartAt: originalGrossBoundary },
    });
    await prisma.$disconnect();
  });

  it('persists bounded missing versus delayed and unresolved findings without leaking provider IDs', async () => {
    const created = Math.floor((day.getTime() + 13 * 3_600_000) / 1000);
    stripe.listFinancialEvents.mockResolvedValue({ events: eventIds.map((id, index) => ({
      id, type: index === 2 ? 'charge.updated' : 'invoice.payment_succeeded',
      created, currency: 'usd',
    })), hasMore: false });
    const service = new BillingEventCompletenessService(prisma, stripe as never);
    const [first, second] = await Promise.all([
      service.scan({ from: dayText, to: dayText }),
      service.scan({ from: dayText, to: dayText }),
    ]);
    scanIds = [first, second];
    expect(first).not.toBe(second);
    for (const scanId of scanIds) {
      const page = await service.getPage({ scanId, from: dayText, to: dayText, limit: 20 });
      expect(page.status).toBe('completed');
      expect(page.scannedEventCount).toBe(3);
      expect(page.findings.map((finding) => finding.finding).sort()).toEqual([
        'missing_receipt', 'unresolved_evidence',
      ]);
      expect(page.findings.every((finding) => finding.id !== eventIds[0])).toBe(true);
      expect(JSON.stringify(page)).not.toMatch(new RegExp(eventIds.join('|')));
      expect(await prisma.billingEventScanDiscrepancy.count({ where: { scanId } })).toBe(2);
    }
    expect(stripe.listFinancialEvents).toHaveBeenCalledTimes(2);

    // A delayed local receipt changes only a later snapshot; prior scan history
    // remains durable and is not rewritten into a false clean result.
    await prisma.stripeWebhookEvent.create({ data: {
      eventId: eventIds[0], type: 'invoice.payment_succeeded',
    } });
    await prisma.billingFinancialEvent.create({ data: {
      sourceStripeEventId: eventIds[0], category: 'gross_revenue', amountMinor: 100n,
      currency: 'usd', effectiveAt: new Date(created * 1000),
    } });
    await prisma.billingStripeFeeObservation.create({ data: {
      sourceStripeEventId: eventIds[0], resolution: 'zero_fee',
    } });
    const later = await service.scan({ from: dayText, to: dayText });
    scanIds.push(later);
    const laterPage = await service.getPage({ scanId: later, from: dayText, to: dayText, limit: 20 });
    expect(laterPage.findings.map((finding) => finding.finding)).toEqual(['unresolved_evidence']);
    expect((await service.getPage({ scanId: first, from: dayText, to: dayText })).findings)
      .toHaveLength(2);
  });

  it('distinguishes excluded invoices, eligible effects, and a genuinely missing eligible effect', async () => {
    const ids = ['excluded', 'eligibleEffect', 'eligibleMissing'].map((kind) => `evt_${run}${kind}`);
    eventIds.push(...ids);
    const created = Math.floor((day.getTime() + 14 * 3_600_000) / 1000);
    const billing = new BillingService(prisma, { retrieveSubscription: jest.fn(async () => ({
      id: `sub_${run}unmatched`, status: 'active',
    })) } as never, new SubscriptionLifecycleService(),
    new BillingFinancialMetricsRecorderService(), { prepare: jest.fn(async () => null) } as never);
    await billing.handleWebhook({ id: ids[0], type: 'invoice.payment_succeeded', created,
      data: { object: { id: `in_${run}unmatched`, subscription: `sub_${run}unmatched`,
        payment_intent: `pi_${run}unmatched`, amount_paid: 250, currency: 'usd' } } } as never);
    expect(await prisma.billingInvoiceFinancialOutcome.findUnique({
      where: { sourceStripeEventId: ids[0] }, select: { status: true },
    })).toEqual({ status: 'excluded_no_local_subscription' });
    await prisma.stripeWebhookEvent.createMany({ data: ids.slice(1).map((eventId) => ({
      eventId, type: 'invoice.payment_succeeded',
    })) });
    await prisma.billingInvoiceFinancialOutcome.createMany({ data: ids.slice(1).map((sourceStripeEventId) => ({
      sourceStripeEventId, status: 'eligible',
    })) });
    await prisma.billingFinancialEvent.create({ data: {
      sourceStripeEventId: ids[1], category: 'gross_revenue', amountMinor: 250n,
      currency: 'usd', effectiveAt: new Date(created * 1000),
    } });
    await prisma.billingStripeFeeObservation.createMany({ data: ids.map((sourceStripeEventId) => ({
      sourceStripeEventId, resolution: 'zero_fee',
    })) });
    stripe.listFinancialEvents.mockResolvedValueOnce({ events: ids.map((id) => ({
      id, type: 'invoice.payment_succeeded', created, currency: 'usd',
    })), hasMore: false });
    const service = new BillingEventCompletenessService(prisma, stripe as never);
    const scanId = await service.scan({ from: dayText, to: dayText });
    scanIds.push(scanId);
    const page = await service.getPage({ scanId, from: dayText, to: dayText });
    expect(page.status).toBe('completed');
    expect(page.findings.map((finding) => finding.finding)).toEqual(['missing_gross_effect']);
    const stored = await prisma.billingEventScanDiscrepancy.findMany({ where: { scanId },
      select: { sourceStripeEventId: true, finding: true } });
    expect(stored).toEqual([{ sourceStripeEventId: ids[2], finding: 'missing_gross_effect' }]);
    expect(JSON.stringify(page)).not.toContain(ids[2]);
  });

  it('keeps each comparison page on one snapshot while a webhook commits between local reads', async () => {
    const eventId = `evt_${run}inflight`;
    eventIds.push(eventId);
    const created = Math.floor((day.getTime() + 15 * 3_600_000) / 1000);
    let enteredPrepare!: () => void;
    let releasePrepare!: (value: { balanceTransaction: null }) => void;
    const entered = new Promise<void>((resolve) => { enteredPrepare = resolve; });
    const providerGate = new Promise<{ balanceTransaction: null }>((resolve) => { releasePrepare = resolve; });
    const feeService = { prepare: jest.fn(async () => { enteredPrepare(); return providerGate; }),
      recordInTransaction: jest.fn(async (tx: typeof prisma, sourceStripeEventId: string) => {
        await tx.billingStripeFeeObservation.create({ data: { sourceStripeEventId, resolution: 'zero_fee' } });
      }) };
    const billing = new BillingService(prisma, {} as never, new SubscriptionLifecycleService(),
      new BillingFinancialMetricsRecorderService(), feeService as never,
      undefined, new BillingFinancialCompletenessService(prisma));
    const event = { id: eventId, type: 'charge.updated', created,
      data: { object: { id: `ch_${run}` } } };
    const processing = billing.handleWebhook(event as never);
    await entered;
    expect(await prisma.stripeWebhookEvent.findUnique({ where: { eventId } })).toBeNull();
    expect(await prisma.billingFinancialEvidenceCase.count({ where: {
      sourceStripeEventId: eventId, state: 'pending',
    } })).toBe(1);
    stripe.listFinancialEvents.mockResolvedValue({ events: [{ id: eventId, type: event.type,
      created, currency: 'usd' }], hasMore: false });
    const service = new BillingEventCompletenessService(prisma, stripe as never);
    const early = await service.scan({ from: dayText, to: dayText });
    scanIds.push(early);
    const earlyPage = await service.getPage({ scanId: early, from: dayText, to: dayText });
    expect(earlyPage.findings.map((finding) => finding.finding)).toEqual(['unresolved_evidence']);

    let receiptRead!: () => void;
    let continueAfterCommit!: () => void;
    const receiptReadSignal = new Promise<void>((resolve) => { receiptRead = resolve; });
    const afterCommitSignal = new Promise<void>((resolve) => { continueAfterCommit = resolve; });
    const interleavedPrisma = new Proxy(prisma, {
      get(target, property) {
        if (property !== '$transaction') return Reflect.get(target, property);
        return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: { isolationLevel: Prisma.TransactionIsolationLevel; maxWait: number; timeout: number }) =>
          prisma.$transaction(async (tx) => callback(new Proxy(tx, {
            get(transaction, key) {
              if (key !== 'stripeWebhookEvent') return Reflect.get(transaction, key);
              return { findMany: async (args: { where: { eventId: { in: string[] } }; select: { eventId: true } }) => {
                const receipts = await tx.stripeWebhookEvent.findMany(args);
                expect(receipts).toEqual([]);
                receiptRead();
                await afterCommitSignal;
                return receipts;
              } };
            },
          })), options);
      },
    });
    const interleavedService = new BillingEventCompletenessService(interleavedPrisma, stripe as never);
    const interleavedScan = interleavedService.scan({ from: dayText, to: dayText });
    await receiptReadSignal;
    // The first receipt SELECT has established the RepeatableRead snapshot.
    // Complete the real webhook before the scanner reads evidence/outcomes.
    releasePrepare({ balanceTransaction: null });
    await expect(processing).resolves.toEqual({ received: true });
    expect(await prisma.billingFinancialEvidenceCase.count({ where: {
      sourceStripeEventId: eventId, state: 'resolved_zero',
    } })).toBe(1);
    continueAfterCommit();
    const interleavedId = await interleavedScan;
    scanIds.push(interleavedId);
    const interleavedPage = await service.getPage({ scanId: interleavedId, from: dayText, to: dayText });
    expect(interleavedPage.status).toBe('completed');
    expect(interleavedPage.findings.map((finding) => finding.finding)).toEqual(['unresolved_evidence']);
    expect(interleavedPage.findings.some((finding) => finding.finding === 'missing_receipt')).toBe(false);
    const later = await service.scan({ from: dayText, to: dayText });
    scanIds.push(later);
    const laterPage = await service.getPage({ scanId: later, from: dayText, to: dayText });
    expect(laterPage.findings).toEqual([]);
    expect((await service.getPage({ scanId: early, from: dayText, to: dayText })).findings)
      .toEqual(earlyPage.findings);
    expect((await service.getPage({ scanId: interleavedId, from: dayText, to: dayText })).findings)
      .toEqual(interleavedPage.findings);
  });

  it('persists attempted but no verified range after provider failure or a 500-event page cap', async () => {
    const service = new BillingEventCompletenessService(prisma, stripe as never);
    stripe.listFinancialEvents.mockRejectedValueOnce(new Error('synthetic provider secret'));
    const failed = await service.scan({ from: dayText, to: dayText });
    scanIds.push(failed);
    const failedPage = await service.getPage({ scanId: failed, from: dayText, to: dayText });
    expect(failedPage.status).toBe('failed');
    expect(failedPage.attemptedRange).not.toBeNull();
    expect(failedPage.verifiedCoveredRange).toBeNull();
    expect(JSON.stringify(failedPage)).not.toContain('synthetic provider secret');

    let sequence = 0;
    const created = Math.floor((day.getTime() + 16 * 3_600_000) / 1000);
    stripe.listFinancialEvents.mockImplementation(async () => ({
      events: Array.from({ length: 100 }, () => ({ id: `evt_${run}page${++sequence}`,
        type: 'invoice.payment_failed', created, currency: 'usd' })), hasMore: true,
    }));
    const capped = await service.scan({ from: dayText, to: dayText });
    scanIds.push(capped);
    const cappedPage = await service.getPage({ scanId: capped, from: dayText, to: dayText });
    expect(cappedPage.status).toBe('incomplete');
    expect(cappedPage.reason).toBe('provider_page_cap');
    expect(cappedPage.scannedEventCount).toBe(500);
    expect(cappedPage.attemptedRange).not.toBeNull();
    expect(cappedPage.verifiedCoveredRange).toBeNull();
    expect(await prisma.billingEventScanDiscrepancy.count({ where: { scanId: capped } })).toBe(500);
  });
});

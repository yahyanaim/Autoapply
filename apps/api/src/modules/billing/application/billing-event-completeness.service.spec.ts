import { BillingEventCompletenessService, SUPPORTED_FINANCIAL_EVENT_TYPES } from './billing-event-completeness.service';

const day = '2026-10-05';
const at = (time: string) => new Date(`2026-10-05T${time}Z`);

describe('BillingEventCompletenessService', () => {
  const prisma = {
    $transaction: jest.fn(),
    billingEventScanBoundary: { findUniqueOrThrow: jest.fn() },
    billingEventScan: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    billingEventScanDiscrepancy: { createMany: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    stripeWebhookEvent: { findMany: jest.fn() },
    billingInvoiceFinancialOutcome: { findMany: jest.fn() },
    billingFinancialEvent: { findMany: jest.fn() },
    billingRefundObservation: { findMany: jest.fn() },
    billingDisputeObservation: { findMany: jest.fn() },
    billingStripeFeeObservation: { findMany: jest.fn() },
    billingStripeFeeEffect: { findMany: jest.fn() },
    billingDisputeEffect: { findMany: jest.fn() },
    billingFinancialEvidenceCase: { findMany: jest.fn() },
    billingFinancialMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingRefundMetricsBoundary: { findUniqueOrThrow: jest.fn() },
  };
  const stripe = { listFinancialEvents: jest.fn() };
  const service = new BillingEventCompletenessService(prisma as never, stripe as never);
  const providerEvent = (id: string, type = 'invoice.payment_succeeded') => ({
    id, type, created: Math.floor(at('13:00:00.000').getTime() / 1000), currency: 'usd',
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-07T12:00:00.000Z'));
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.billingEventScanBoundary.findUniqueOrThrow.mockResolvedValue({ startsAt: at('12:00:00.000') });
    prisma.billingEventScan.create.mockResolvedValue({ id: 'scan_synthetic1' });
    prisma.billingEventScan.update.mockResolvedValue({});
    prisma.billingFinancialMetricsBoundary.findUniqueOrThrow.mockResolvedValue({ metricsStartAt: at('12:00:00.000') });
    prisma.billingRefundMetricsBoundary.findUniqueOrThrow.mockResolvedValue({ metricsStartAt: at('12:00:00.000') });
    for (const key of ['stripeWebhookEvent', 'billingInvoiceFinancialOutcome', 'billingFinancialEvent', 'billingRefundObservation',
      'billingDisputeObservation', 'billingStripeFeeObservation', 'billingStripeFeeEffect',
      'billingDisputeEffect', 'billingFinancialEvidenceCase'] as const) {
      prisma[key].findMany.mockResolvedValue([]);
    }
    stripe.listFinancialEvents.mockResolvedValue({ events: [], hasMore: false });
  });
  afterEach(() => jest.useRealTimers());

  it('uses only supported event types and marks a future-only partial boundary incomplete', async () => {
    await service.scan({ from: day, to: day });
    expect(stripe.listFinancialEvents).toHaveBeenCalledWith({
      fromSeconds: Math.ceil(at('12:00:00.000').getTime() / 1000),
      throughSeconds: Math.floor(at('23:59:59.000').getTime() / 1000),
      types: [...SUPPORTED_FINANCIAL_EVENT_TYPES], limit: 100,
      startingAfter: undefined,
    });
    expect(prisma.billingEventScan.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'incomplete', reason: 'partial_window' }),
    }));
    expect(prisma.billingEventScanDiscrepancy.createMany).not.toHaveBeenCalled();
  });

  it('lists provider events outside each bounded local snapshot transaction', async () => {
    let inTransaction = false;
    prisma.$transaction.mockImplementation(async (callback) => {
      inTransaction = true;
      try { return await callback(prisma); } finally { inTransaction = false; }
    });
    stripe.listFinancialEvents.mockImplementation(async () => {
      expect(inTransaction).toBe(false);
      return { events: [providerEvent('evt_snapshot1')], hasMore: false };
    });
    await service.scan({ from: day, to: day });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 5_000,
    });
  });

  it('distinguishes missing receipt from delayed receipt and unresolved evidence', async () => {
    stripe.listFinancialEvents.mockResolvedValueOnce({ events: [providerEvent('evt_synthetic1')], hasMore: false });
    await service.scan({ from: day, to: day });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 5_000,
    }));
    expect(prisma.billingEventScanDiscrepancy.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ finding: 'missing_receipt', sourceStripeEventId: 'evt_synthetic1' })],
      skipDuplicates: true,
    });
    jest.clearAllMocks();
    prisma.billingEventScanBoundary.findUniqueOrThrow.mockResolvedValue({ startsAt: at('12:00:00.000') });
    prisma.billingEventScan.create.mockResolvedValue({ id: 'scan_synthetic2' });
    prisma.billingEventScan.update.mockResolvedValue({});
    prisma.billingFinancialMetricsBoundary.findUniqueOrThrow.mockResolvedValue({ metricsStartAt: at('12:00:00.000') });
    prisma.billingRefundMetricsBoundary.findUniqueOrThrow.mockResolvedValue({ metricsStartAt: at('12:00:00.000') });
    stripe.listFinancialEvents.mockResolvedValue({ events: [providerEvent('evt_synthetic1')], hasMore: false });
    prisma.stripeWebhookEvent.findMany.mockResolvedValue([{ eventId: 'evt_synthetic1' }]);
    prisma.billingFinancialEvent.findMany.mockResolvedValue([{ sourceStripeEventId: 'evt_synthetic1' }]);
    prisma.billingFinancialEvidenceCase.findMany.mockResolvedValue([{ sourceStripeEventId: 'evt_synthetic1', state: 'pending' }]);
    prisma.billingInvoiceFinancialOutcome.findMany.mockResolvedValue([]);
    for (const key of ['billingRefundObservation', 'billingDisputeObservation', 'billingStripeFeeObservation',
      'billingStripeFeeEffect', 'billingDisputeEffect'] as const) prisma[key].findMany.mockResolvedValue([]);
    await service.scan({ from: day, to: day });
    const findings = prisma.billingEventScanDiscrepancy.createMany.mock.calls[0][0].data;
    expect(findings.map((item: { finding: string }) => item.finding)).toEqual(['unresolved_evidence']);
  });

  it('treats a pre-receipt pending evidence case as in-flight, not a confirmed missing receipt', async () => {
    stripe.listFinancialEvents.mockResolvedValue({ events: [providerEvent('evt_inflight1', 'charge.updated')], hasMore: false });
    prisma.billingFinancialEvidenceCase.findMany.mockResolvedValue([{
      sourceStripeEventId: 'evt_inflight1', state: 'pending',
    }]);
    await service.scan({ from: day, to: day });
    expect(prisma.billingEventScanDiscrepancy.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ sourceStripeEventId: 'evt_inflight1', finding: 'unresolved_evidence' })],
      skipDuplicates: true,
    });
  });

  it.each([
    ['excluded_no_local_subscription', false, []],
    ['eligible', true, []],
    ['eligible', false, ['missing_gross_effect']],
    [null, false, ['unresolved_evidence']],
  ] as const)('classifies durable invoice outcome %s with gross effect %s', async (outcome, hasGross, expected) => {
    const event = providerEvent('evt_invoice1');
    stripe.listFinancialEvents.mockResolvedValue({ events: [event], hasMore: false });
    prisma.stripeWebhookEvent.findMany.mockResolvedValue([{ eventId: event.id }]);
    prisma.billingInvoiceFinancialOutcome.findMany.mockResolvedValue(outcome ? [{
      sourceStripeEventId: event.id, status: outcome,
    }] : []);
    prisma.billingFinancialEvent.findMany.mockResolvedValue(hasGross ? [{ sourceStripeEventId: event.id }] : []);
    prisma.billingStripeFeeObservation.findMany.mockResolvedValue([{
      sourceStripeEventId: event.id, resolution: 'zero_fee',
    }]);
    await service.scan({ from: day, to: day });
    const findings = prisma.billingEventScanDiscrepancy.createMany.mock.calls[0]?.[0]?.data ?? [];
    expect(findings.map((finding: { finding: string }) => finding.finding)).toEqual(expected);
  });

  it('does not demand monetary effects before their own boundary or for status-only events', async () => {
    const events = [providerEvent('evt_refund1', 'refund.updated'),
      providerEvent('evt_dispute1', 'charge.dispute.closed'),
      providerEvent('evt_failed1', 'invoice.payment_failed')];
    stripe.listFinancialEvents.mockResolvedValue({ events, hasMore: false });
    prisma.stripeWebhookEvent.findMany.mockResolvedValue(events.map((event) => ({ eventId: event.id })));
    prisma.billingRefundMetricsBoundary.findUniqueOrThrow.mockResolvedValue({ metricsStartAt: at('14:00:00.000') });
    prisma.billingRefundObservation.findMany.mockResolvedValue([{
      sourceStripeEventId: 'evt_refund1', status: 'succeeded',
      refund: { currencySupport: 'usd', firstSucceededAt: at('13:00:00.000'), effect: null },
    }]);
    prisma.billingDisputeObservation.findMany.mockResolvedValue([{
      sourceStripeEventId: 'evt_dispute1', resolution: 'status_only',
    }]);
    prisma.billingStripeFeeObservation.findMany.mockResolvedValue([{
      sourceStripeEventId: 'evt_refund1', resolution: 'pre_boundary',
    }]);
    await service.scan({ from: day, to: day });
    expect(prisma.billingEventScanDiscrepancy.createMany).not.toHaveBeenCalled();
  });

  it('marks a successful post-boundary refund without its effect as discrepant', async () => {
    stripe.listFinancialEvents.mockResolvedValue({ events: [providerEvent('evt_refund2', 'refund.updated')], hasMore: false });
    prisma.stripeWebhookEvent.findMany.mockResolvedValue([{ eventId: 'evt_refund2' }]);
    prisma.billingRefundObservation.findMany.mockResolvedValue([{
      sourceStripeEventId: 'evt_refund2', status: 'succeeded',
      refund: { currencySupport: 'usd', firstSucceededAt: at('13:00:00.000'), effect: null },
    }]);
    prisma.billingStripeFeeObservation.findMany.mockResolvedValue([{
      sourceStripeEventId: 'evt_refund2', resolution: 'zero_fee',
    }]);
    await service.scan({ from: day, to: day });
    expect(prisma.billingEventScanDiscrepancy.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ finding: 'missing_refund_effect' })], skipDuplicates: true,
    });
  });

  it('never treats provider failure or a truncated page as a clean result', async () => {
    stripe.listFinancialEvents.mockRejectedValueOnce(new Error('secret provider diagnostic'));
    await service.scan({ from: day, to: day });
    expect(prisma.billingEventScan.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', reason: 'provider_or_comparison_failure' }),
    }));
    expect(prisma.billingEventScan.update.mock.calls.every(([call]) => !('verifiedFrom' in call.data))).toBe(true);
    expect(JSON.stringify(prisma.billingEventScan.update.mock.calls)).not.toContain('secret provider diagnostic');
    stripe.listFinancialEvents.mockResolvedValue({ events: [providerEvent('evt_synthetic2')], hasMore: true });
    await service.scan({ from: day, to: day });
    expect(prisma.billingEventScan.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'incomplete', reason: 'provider_page_invalid' }),
    }));
    expect(prisma.billingEventScan.update.mock.calls.every(([call]) => !('verifiedFrom' in call.data))).toBe(true);
  });

  it('caps provider pagination and rejects duplicate event IDs across pages', async () => {
    let index = 0;
    stripe.listFinancialEvents.mockImplementation(async () => ({
      events: Array.from({ length: 100 }, () => providerEvent(`evt_page${++index}`)), hasMore: true,
    }));
    await service.scan({ from: day, to: day });
    expect(stripe.listFinancialEvents).toHaveBeenCalledTimes(5);
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
    expect(prisma.billingEventScan.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'incomplete', reason: 'provider_page_cap', scannedCount: 500 }),
    }));
    expect(prisma.billingEventScan.update.mock.calls.every(([call]) => !('verifiedFrom' in call.data))).toBe(true);
    jest.clearAllMocks();
    stripe.listFinancialEvents.mockResolvedValue({
      events: [providerEvent('evt_repeated1')], hasMore: true,
    });
    prisma.billingEventScanBoundary.findUniqueOrThrow.mockResolvedValue({ startsAt: at('12:00:00.000') });
    prisma.billingEventScan.create.mockResolvedValue({ id: 'scan_repeated1' });
    prisma.billingEventScan.update.mockResolvedValue({});
    prisma.billingFinancialMetricsBoundary.findUniqueOrThrow.mockResolvedValue({ metricsStartAt: at('12:00:00.000') });
    prisma.billingRefundMetricsBoundary.findUniqueOrThrow.mockResolvedValue({ metricsStartAt: at('12:00:00.000') });
    for (const key of ['stripeWebhookEvent', 'billingInvoiceFinancialOutcome', 'billingFinancialEvent', 'billingRefundObservation',
      'billingDisputeObservation', 'billingStripeFeeObservation', 'billingStripeFeeEffect',
      'billingDisputeEffect', 'billingFinancialEvidenceCase'] as const) prisma[key].findMany.mockResolvedValue([]);
    await service.scan({ from: day, to: day });
    expect(stripe.listFinancialEvents).toHaveBeenCalledTimes(2);
    expect(prisma.billingEventScan.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'incomplete', reason: 'provider_page_invalid' }),
    }));
  });

  it('returns unavailable outside the provider window without calling Stripe', async () => {
    await service.scan({ from: '2026-08-01', to: '2026-08-01' });
    expect(stripe.listFinancialEvents).not.toHaveBeenCalled();
    expect(prisma.billingEventScan.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'unavailable', reason: 'provider_window_unavailable' }),
    }));
  });

  it('paginates only safe fields and never projects provider identifiers', async () => {
    prisma.billingEventScan.findUnique.mockResolvedValue({
      id: 'scan_synthetic1', from: at('00:00:00.000'), toExclusive: new Date('2026-10-06T00:00:00Z'),
      attemptedFrom: at('12:00:00.000'), attemptedToExclusive: new Date('2026-10-06T00:00:00Z'),
      verifiedFrom: at('12:00:00.000'), verifiedToExclusive: new Date('2026-10-06T00:00:00Z'),
      asOf: new Date('2026-10-07T12:00:00Z'), status: 'incomplete', reason: 'partial_window',
      scannedCount: 2, completedAt: new Date('2026-10-07T12:00:01Z'),
    });
    prisma.billingEventScanDiscrepancy.findMany.mockResolvedValue([
      { id: 'local_opaque1', eventType: 'refund.updated', eventAt: at('13:00:00.000'), finding: 'missing_receipt',
        sourceStripeEventId: 'evt_private', payload: { customer: 'cus_private' } },
      { id: 'local_opaque2', eventType: 'refund.updated', eventAt: at('13:01:00.000'), finding: 'missing_receipt' },
    ]);
    const response = await service.getPage({ scanId: 'scan_synthetic1', from: day, to: day, limit: 1 });
    expect(response.attemptedRange).toEqual({ from: at('12:00:00.000').toISOString(),
      toExclusive: new Date('2026-10-06T00:00:00Z').toISOString() });
    expect(response.verifiedCoveredRange).toEqual(response.attemptedRange);
    expect(response.findings).toEqual([{ id: 'local_opaque1', eventType: 'refund.updated',
      eventAt: at('13:00:00.000').toISOString(), finding: 'missing_receipt' }]);
    expect(response.nextCursor).toBe('local_opaque1');
    expect(JSON.stringify(response)).not.toMatch(/evt_private|cus_private|sourceStripeEventId|payload/);
    expect(prisma.billingEventScanDiscrepancy.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it.each([['failed', 'provider_or_comparison_failure'], ['incomplete', 'provider_page_cap']] as const)(
    'does not present an attempted range as verified for %s provider enumeration', async (status, reason) => {
      prisma.billingEventScan.findUnique.mockResolvedValue({
        id: 'scan_synthetic1', from: at('00:00:00.000'), toExclusive: new Date('2026-10-06T00:00:00Z'),
        attemptedFrom: at('12:00:00.000'), attemptedToExclusive: new Date('2026-10-06T00:00:00Z'),
        verifiedFrom: null, verifiedToExclusive: null,
        asOf: new Date('2026-10-07T12:00:00Z'), status, reason, scannedCount: 500, completedAt: new Date(),
      });
      prisma.billingEventScanDiscrepancy.findMany.mockResolvedValue([]);
      const response = await service.getPage({ scanId: 'scan_synthetic1', from: day, to: day });
      expect(response.attemptedRange).not.toBeNull();
      expect(response.verifiedCoveredRange).toBeNull();
      expect(response.status).toBe(status);
      expect(response.reason).toBe(reason);
    },
  );
});

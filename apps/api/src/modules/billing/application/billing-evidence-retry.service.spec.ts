import { BillingEvidenceRetryService } from './billing-evidence-retry.service';

describe('BillingEvidenceRetryService', () => {
  const claimed = {
    id: 'case-1', sourceStripeEventId: 'evt_synthetic1', component: 'stripe_fee' as const,
    eventType: 'charge.updated', providerReference: 'ch_synthetic1',
    fencingToken: 1, attempts: 1,
  };
  const tx = {
    billingFinancialEvidenceCase: { count: jest.fn().mockResolvedValue(1) },
    billingStripeFeeMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingStripeFeeEffect: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    billingDailyStripeFeeMetric: { upsert: jest.fn() },
  };
  const prisma = {
    stripeWebhookEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'receipt-1' }) },
    billingCombinedMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const stripe = { retrieveEvent: jest.fn() };
  const completeness = {
    claimDue: jest.fn().mockResolvedValue([claimed]),
    releaseClaim: jest.fn(), resolveInTransaction: jest.fn().mockResolvedValue(true),
  };
  const stripeFees = { prepare: jest.fn() };
  const service = new BillingEvidenceRetryService(
    prisma as never, stripe as never, completeness as never, stripeFees as never,
    { get: jest.fn() } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.billingCombinedMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: new Date('2026-10-04T00:00:00Z'),
    });
    tx.billingStripeFeeMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: new Date('2026-10-01T00:00:00Z'),
    });
    stripe.retrieveEvent.mockResolvedValue({ id: claimed.sourceStripeEventId, type: claimed.eventType });
    stripeFees.prepare.mockResolvedValue({
      balanceTransaction: {
        id: 'txn_synthetic1', fee: 27, currency: 'usd',
        created: Math.floor(new Date('2026-10-02T12:00:00Z').getTime() / 1000),
      }, missingFee: false,
    });
  });

  it('repairs the older fee ledger while excluding the effect from newer combined coverage', async () => {
    await service.processDueOnce();
    expect(tx.billingStripeFeeEffect.createMany).toHaveBeenCalledTimes(1);
    expect(tx.billingDailyStripeFeeMetric.upsert).toHaveBeenCalledTimes(1);
    expect(completeness.resolveInTransaction).toHaveBeenCalledWith(
      tx, claimed.sourceStripeEventId, 'stripe_fee', 'excluded_pre_boundary',
      new Date('2026-10-02T12:00:00Z'), claimed.fencingToken,
    );
  });

  it('keeps a provider failure pending and retries the same durable case', async () => {
    stripe.retrieveEvent.mockRejectedValueOnce(new Error('synthetic provider outage'));
    await service.processDueOnce();
    expect(tx.billingStripeFeeEffect.createMany).not.toHaveBeenCalled();
    expect(completeness.resolveInTransaction).not.toHaveBeenCalled();
    expect(completeness.releaseClaim).toHaveBeenCalledWith(claimed.id, claimed.fencingToken);
    await service.processDueOnce();
    expect(tx.billingStripeFeeEffect.createMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['exact combined boundary', Math.floor(new Date('2026-10-04T00:00:00Z').getTime() / 1000)],
    ['post-boundary', Math.floor(new Date('2026-10-05T12:00:00Z').getTime() / 1000)],
  ])('records %s authoritative fee evidence', async (_label, created) => {
    stripeFees.prepare.mockResolvedValueOnce({
      balanceTransaction: { id: 'txn_synthetic1', fee: 27, currency: 'usd', created },
      missingFee: false,
    });
    await service.processDueOnce();
    expect(tx.billingStripeFeeEffect.createMany).toHaveBeenCalledTimes(1);
    expect(completeness.resolveInTransaction).toHaveBeenCalledWith(
      tx, claimed.sourceStripeEventId, 'stripe_fee', 'resolved_effect',
      new Date(created * 1000), claimed.fencingToken,
    );
  });

  it.each([
    ['zero', 0], ['negative', -1], ['NaN', Number.NaN],
    ['invalid fractional', 1.5], ['missing', undefined],
  ])('leaves %s effective timestamp unresolved', async (_label, created) => {
    stripeFees.prepare.mockResolvedValueOnce({
      balanceTransaction: { id: 'txn_synthetic1', fee: 27, currency: 'usd', created },
      missingFee: false,
    });
    await service.processDueOnce();
    expect(tx.billingStripeFeeEffect.createMany).not.toHaveBeenCalled();
    expect(completeness.resolveInTransaction).not.toHaveBeenCalled();
    expect(completeness.releaseClaim).toHaveBeenCalledWith(claimed.id, claimed.fencingToken);
  });
});

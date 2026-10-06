import { BillingFinancialCompletenessService } from './billing-financial-completeness.service';

describe('BillingFinancialCompletenessService', () => {
  const tx = {
    billingCombinedMetricsBoundary: {
      findUniqueOrThrow: jest.fn(), updateMany: jest.fn(),
    },
    billingFinancialEvidenceCase: {
      createMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(),
    },
    billingEvidenceResolution: { create: jest.fn() },
    billingStripeFeeObservation: { findUnique: jest.fn() },
    billingDisputeObservation: { findUnique: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    billingCombinedMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingFinancialEvidenceCase: { count: jest.fn() },
  };
  const service = new BillingFinancialCompletenessService(prisma as never, {
    now: () => new Date('2026-10-06T00:00:00Z'),
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.billingCombinedMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: new Date('2026-10-04T00:00:00Z'),
    });
    tx.billingFinancialEvidenceCase.findUnique.mockResolvedValue({ id: 'case-1', fencingToken: 2 });
    tx.billingFinancialEvidenceCase.updateMany.mockResolvedValue({ count: 1 });
    prisma.billingCombinedMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: new Date('2026-10-04T00:00:00Z'),
      captureActivatedAt: new Date('2026-10-04T12:00:00Z'), currency: 'usd',
    });
    prisma.billingFinancialEvidenceCase.count.mockResolvedValue(0);
    tx.billingStripeFeeObservation.findUnique.mockResolvedValue(null);
    tx.billingDisputeObservation.findUnique.mockResolvedValue(null);
  });

  it('persists only allow-listed minimal references before provider retrieval', async () => {
    await service.begin({ id: 'evt_synthetic1', type: 'charge.dispute.funds_withdrawn',
      data: { object: { id: 'du_synthetic1', customer: 'cus_secret',
        metadata: { token: 'secret' } } } } as never);
    expect(tx.billingFinancialEvidenceCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ component: 'stripe_fee', providerReference: 'du_synthetic1' }),
        expect.objectContaining({ component: 'dispute_movement', providerReference: 'du_synthetic1' }),
      ], skipDuplicates: true,
    });
    expect(JSON.stringify(tx.billingFinancialEvidenceCase.createMany.mock.calls)).not.toMatch(
      /cus_secret|metadata|token|secret/i,
    );
  });

  it('leaves missing authoritative fee unresolved; later zero is evidenced', async () => {
    tx.billingStripeFeeObservation.findUnique.mockResolvedValueOnce({
      resolution: 'missing_authoritative_fee',
    });
    await service.completeInTransaction(tx as never, 'evt_synthetic1', null);
    expect(tx.billingFinancialEvidenceCase.updateMany).not.toHaveBeenCalled();

    tx.billingStripeFeeObservation.findUnique.mockResolvedValueOnce({ resolution: 'zero_fee' });
    await service.completeInTransaction(tx as never, 'evt_synthetic1', {
      balanceTransaction: { created: 1_780_000_000, fee: 0 }, missingFee: false,
    } as never);
    expect(tx.billingFinancialEvidenceCase.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ state: 'resolved_zero' }),
    }));
    expect(tx.billingEvidenceResolution.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unsupported_currency', 'excluded_non_usd'],
    ['pre_boundary', 'excluded_pre_boundary'],
  ])('classifies proven %s evidence as %s with its effective timestamp', async (resolution, state) => {
    tx.billingStripeFeeObservation.findUnique.mockResolvedValueOnce({ resolution });
    await service.completeInTransaction(tx as never, 'evt_synthetic1', {
      balanceTransaction: { created: 1_780_000_000, fee: 10 }, missingFee: false,
    } as never);
    expect(tx.billingFinancialEvidenceCase.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { state, effectiveAt: new Date(1_780_000_000_000), leaseExpiresAt: null },
    }));
  });

  it('marks unknown-effective-time evidence unresolved for any covered range', async () => {
    prisma.billingFinancialEvidenceCase.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const result = await service.getCoverage({
      from: new Date('2026-10-04T00:00:00Z'), toExclusive: new Date('2026-10-05T00:00:00Z'),
    });
    expect(result.status).toBe('unresolved');
    expect(prisma.billingFinancialEvidenceCase.count).toHaveBeenCalledWith({
      where: { state: 'pending', OR: [
        { effectiveAt: null }, { effectiveAt: {
          gte: new Date('2026-10-04T12:00:00Z'), lt: new Date('2026-10-05T00:00:00Z'),
        } },
      ] },
    });
  });

  it('keeps pre-activation coverage unavailable rather than fabricating zero', async () => {
    const result = await service.getCoverage({
      from: new Date('2026-10-03T00:00:00Z'), toExclusive: new Date('2026-10-04T00:00:00Z'),
    });
    expect(result.status).toBe('unavailable');
    expect(result.actualCoveredRange).toBeNull();
    expect(prisma.billingFinancialEvidenceCase.count).not.toHaveBeenCalled();
  });

  it('keeps the exact intraday activation instant and marks the boundary day partial', async () => {
    const input = {
      from: new Date('2026-10-04T00:00:00Z'), toExclusive: new Date('2026-10-05T00:00:00Z'),
    };
    const result = await service.getCoverage(input);
    expect(result.status).toBe('partial');
    expect(result.actualCoveredRange?.from).toEqual(new Date('2026-10-04T12:00:00Z'));
    prisma.billingCombinedMetricsBoundary.findUniqueOrThrow.mockResolvedValueOnce({
      metricsStartAt: input.from, captureActivatedAt: input.from, currency: 'usd',
    });
    expect((await service.getCoverage(input)).status).toBe('full');
  });

  it('never marks future time full and preserves unresolved precedence for elapsed time', async () => {
    const fixed = new BillingFinancialCompletenessService(prisma as never, {
      now: () => new Date('2026-10-05T12:00:00Z'),
    } as never);
    prisma.billingCombinedMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: new Date('2026-10-04T00:00:00Z'),
      captureActivatedAt: new Date('2026-10-04T00:00:00Z'), currency: 'usd',
    });
    const range = {
      from: new Date('2026-10-05T00:00:00Z'), toExclusive: new Date('2026-10-06T00:00:00Z'),
    };
    const partial = await fixed.getCoverage(range);
    expect(partial.status).toBe('partial');
    expect(partial.actualCoveredRange).toEqual({
      from: range.from, toExclusive: new Date('2026-10-05T12:00:00Z'),
    });
    prisma.billingFinancialEvidenceCase.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect((await fixed.getCoverage(range)).status).toBe('unresolved');
    const future = await fixed.getCoverage({
      from: new Date('2026-10-06T00:00:00Z'), toExclusive: new Date('2026-10-07T00:00:00Z'),
    });
    expect(future.status).toBe('unavailable');
    expect(future.actualCoveredRange).toBeNull();
  });
});

import { BillingRecordedNetRevenueService } from './billing-recorded-net-revenue.service';

describe('BillingRecordedNetRevenueService', () => {
  const boundary = (at: string) => ({
    metricsStartAt: new Date(at),
    currency: 'usd',
  });
  const prisma = {
    $transaction: jest.fn(),
    billingFinancialMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingRefundMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingDisputeMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingStripeFeeMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingCombinedMetricsBoundary: { findUniqueOrThrow: jest.fn() },
    billingFinancialEvidenceCase: { count: jest.fn() },
    billingDailyFinancialMetric: { findMany: jest.fn() },
    billingDailyRefundMetric: { findMany: jest.fn() },
    billingDailyDisputeMetric: { findMany: jest.fn() },
    billingDailyStripeFeeMetric: { findMany: jest.fn() },
    billingFinancialEvent: { aggregate: jest.fn() },
    billingRefundEffect: { aggregate: jest.fn() },
    billingDisputeEffect: { aggregate: jest.fn() },
    billingStripeFeeEffect: { aggregate: jest.fn() },
  };
  const service = new BillingRecordedNetRevenueService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (work: (tx: typeof prisma) => unknown) => work(prisma),
    );
    prisma.billingFinancialMetricsBoundary.findUniqueOrThrow.mockResolvedValue(
      boundary('2026-10-01T00:00:00Z'),
    );
    prisma.billingRefundMetricsBoundary.findUniqueOrThrow.mockResolvedValue(
      boundary('2026-10-02T00:00:00Z'),
    );
    prisma.billingDisputeMetricsBoundary.findUniqueOrThrow.mockResolvedValue(
      boundary('2026-10-03T00:00:00Z'),
    );
    prisma.billingStripeFeeMetricsBoundary.findUniqueOrThrow.mockResolvedValue(
      boundary('2026-10-04T10:00:00Z'),
    );
    prisma.billingCombinedMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      ...boundary('2026-10-04T11:00:00Z'),
      captureActivatedAt: new Date('2026-10-04T12:00:00Z'),
    });
    prisma.billingFinancialEvidenceCase.count.mockResolvedValue(0);
    prisma.billingDailyFinancialMetric.findMany.mockResolvedValue([]);
    prisma.billingDailyRefundMetric.findMany.mockResolvedValue([]);
    prisma.billingDailyDisputeMetric.findMany.mockResolvedValue([]);
    prisma.billingDailyStripeFeeMetric.findMany.mockResolvedValue([]);
  });

  it('uses the latest independent boundary and capture activation', async () => {
    expect(await service.getBoundary()).toEqual({
      from: new Date('2026-10-04T12:00:00Z'),
      active: true,
    });
  });

  it('sums signed ledger effects with intraday exclusion and negative fee correction', async () => {
    prisma.billingFinancialEvent.aggregate.mockResolvedValue({
      _sum: { amountMinor: 1_000n },
    });
    prisma.billingRefundEffect.aggregate.mockResolvedValue({
      _sum: { amountMinor: -200n },
    });
    prisma.billingDisputeEffect.aggregate
      .mockResolvedValueOnce({ _sum: { amountMinor: -300n } })
      .mockResolvedValueOnce({ _sum: { amountMinor: 100n } });
    prisma.billingStripeFeeEffect.aggregate.mockResolvedValue({
      _sum: { feeMinor: -25n },
    });
    const result = await service.getWindow({
      from: new Date('2026-10-04T12:00:00Z'),
      toExclusive: new Date('2026-10-04T18:00:00Z'),
    });
    expect(result.daily).toEqual([
      {
        day: '2026-10-04',
        coverage: 'partial',
        grossRevenueMinor: 1_000n,
        refundAdjustmentMinor: -200n,
        disputeWithdrawalMinor: -300n,
        disputeReinstatementMinor: 100n,
        stripeFeeMinor: -25n,
        recordedNetRevenueMinor: 625n,
      },
    ]);
    expect(prisma.billingFinancialEvent.aggregate).toHaveBeenCalledWith({
      where: {
        currency: 'usd',
        effectiveAt: {
          gte: new Date('2026-10-04T12:00:00Z'),
          lt: new Date('2026-10-04T18:00:00Z'),
        },
      },
      _sum: { amountMinor: true },
    });
    expect(prisma.billingDailyFinancialMetric.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('withholds all amounts for unknown-time evidence and treats evidenced zero as zero', async () => {
    prisma.billingFinancialEvidenceCase.count.mockResolvedValueOnce(1);
    const range = {
      from: new Date('2026-10-04T12:00:00Z'),
      toExclusive: new Date('2026-10-04T18:00:00Z'),
    };
    expect(await service.getWindow(range)).toEqual({
      unresolvedCaseCount: 1,
      daily: [],
    });
    expect(prisma.billingFinancialEvent.aggregate).not.toHaveBeenCalled();
    prisma.billingFinancialEvent.aggregate.mockResolvedValue({
      _sum: { amountMinor: null },
    });
    prisma.billingRefundEffect.aggregate.mockResolvedValue({
      _sum: { amountMinor: null },
    });
    prisma.billingDisputeEffect.aggregate.mockResolvedValue({
      _sum: { amountMinor: null },
    });
    prisma.billingStripeFeeEffect.aggregate.mockResolvedValue({
      _sum: { feeMinor: null },
    });
    expect(
      (await service.getWindow(range)).daily[0]?.recordedNetRevenueMinor,
    ).toBe(0n);
  });

  it.each([
    [40n, 960n],
    [0n, 1_000n],
  ])(
    'subtracts a signed fee of %s without double-negating other components',
    async (fee, net) => {
      prisma.billingFinancialEvent.aggregate.mockResolvedValue({
        _sum: { amountMinor: 1_000n },
      });
      prisma.billingRefundEffect.aggregate.mockResolvedValue({
        _sum: { amountMinor: null },
      });
      prisma.billingDisputeEffect.aggregate.mockResolvedValue({
        _sum: { amountMinor: null },
      });
      prisma.billingStripeFeeEffect.aggregate.mockResolvedValue({
        _sum: { feeMinor: fee },
      });
      const result = await service.getWindow({
        from: new Date('2026-10-04T12:00:00Z'),
        toExclusive: new Date('2026-10-04T18:00:00Z'),
      });
      expect(result.daily[0]?.recordedNetRevenueMinor).toBe(net);
      expect(prisma.billingStripeFeeEffect.aggregate).toHaveBeenCalledWith({
        where: {
          currency: 'usd',
          effectiveAt: {
            gte: new Date('2026-10-04T12:00:00Z'),
            lt: new Date('2026-10-04T18:00:00Z'),
          },
        },
        _sum: { feeMinor: true },
      });
    },
  );

  it('uses bounded daily aggregates for a complete UTC day', async () => {
    const day = new Date('2026-10-05T00:00:00Z');
    prisma.billingDailyFinancialMetric.findMany.mockResolvedValue([
      { day, grossRevenueMinor: 1_500n },
    ]);
    prisma.billingDailyRefundMetric.findMany.mockResolvedValue([
      { day, refundAdjustmentMinor: -100n },
    ]);
    prisma.billingDailyDisputeMetric.findMany.mockResolvedValue([
      { day, withdrawnMinor: -250n, reinstatedMinor: 50n },
    ]);
    prisma.billingDailyStripeFeeMetric.findMany.mockResolvedValue([
      { day, feeMinor: 75n },
    ]);
    const result = await service.getWindow({
      from: day,
      toExclusive: new Date('2026-10-06T00:00:00Z'),
    });
    expect(result.daily).toEqual([
      {
        day: '2026-10-05',
        coverage: 'complete',
        grossRevenueMinor: 1_500n,
        refundAdjustmentMinor: -100n,
        disputeWithdrawalMinor: -250n,
        disputeReinstatementMinor: 50n,
        stripeFeeMinor: 75n,
        recordedNetRevenueMinor: 1_125n,
      },
    ]);
    expect(prisma.billingFinancialEvent.aggregate).not.toHaveBeenCalled();
  });
});

import { AiCostLedgerService } from './ai-cost-ledger.service';

describe('AiCostLedgerService', () => {
  const prisma = {
    aiCostMetricsBoundary: {
      findUniqueOrThrow: jest.fn(), updateMany: jest.fn(),
    },
    aiCostIntent: { create: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AiCostLedgerService(prisma as never, {
    now: () => new Date('2026-10-06T00:00:00Z'),
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.aiCostMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: new Date('2026-10-04T00:00:00.000Z'),
      captureActivatedAt: new Date('2026-10-04T12:00:00.000Z'),
    });
    prisma.aiCostMetricsBoundary.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiCostIntent.create.mockResolvedValue({});
    prisma.aiCostIntent.count.mockResolvedValue(0);
  });

  it('rounds decimal USD to micro-units once per attempt and rejects invalid costs', () => {
    expect(service.estimateMicroUsd(1, 1, 0.5, 0.5)).toBe(1n);
    expect(service.estimateMicroUsd(1, 0, 0.5, 0)).toBe(1n);
    expect(service.estimateMicroUsd(1, 0, 0.49, 0)).toBe(0n);
    expect(service.estimateMicroUsd(5, 0, 0, 0)).toBe(0n);
    expect(() => service.estimateMicroUsd(1, 1, -1, 1)).toThrow();
  });

  it('creates an anonymous, stable attempt before provider work', async () => {
    const id = await service.beginAttempt();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(prisma.aiCostIntent.create).toHaveBeenCalledWith({
      data: { id, startedAt: expect.any(Date) },
    });
    expect(JSON.stringify(prisma.aiCostIntent.create.mock.calls)).not.toMatch(
      /userId|email|prompt|resume|provider|token|credential|secret/i,
    );
  });

  it('atomically records an evidenced zero and one daily effect', async () => {
    const tx = {
      aiCostIntent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      aiCostEvent: { create: jest.fn() },
      aiDailyCostMetric: { upsert: jest.fn() },
    };
    await service.finalizeInTransaction(tx as never, {
      intentId: 'opaque-attempt', effectiveAt: new Date('2026-10-04T12:30:00Z'),
      estimatedMicroUsd: 0n,
    });
    expect(tx.aiCostEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      intentId: 'opaque-attempt', kind: 'estimate', estimatedMicroUsd: 0n,
    }) });
    expect(tx.aiDailyCostMetric.upsert).toHaveBeenCalledTimes(1);
  });

  it('keeps null cost unresolved and does not create a monetary event', async () => {
    const tx = {
      aiCostIntent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      aiCostEvent: { create: jest.fn() },
      aiDailyCostMetric: { upsert: jest.fn() },
    };
    await service.finalizeInTransaction(tx as never, {
      intentId: 'opaque-attempt', effectiveAt: new Date('2026-10-04T12:30:00Z'),
      estimatedMicroUsd: null,
    });
    expect(tx.aiCostEvent.create).not.toHaveBeenCalled();
    expect(tx.aiDailyCostMetric.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ uncostedRequestCount: 1, estimatedMicroUsd: 0n }),
    }));
  });

  it('distinguishes unavailable, partial, full, and unresolved coverage', async () => {
    const input = { from: new Date('2026-10-04T00:00:00Z'),
      toExclusive: new Date('2026-10-05T00:00:00Z') };
    expect((await service.getCoverage(input)).status).toBe('partial');
    prisma.aiCostIntent.count.mockResolvedValueOnce(1);
    expect((await service.getCoverage(input)).status).toBe('unresolved');
    prisma.aiCostMetricsBoundary.findUniqueOrThrow.mockResolvedValueOnce({
      metricsStartAt: new Date('2026-10-03T00:00:00Z'),
      captureActivatedAt: new Date('2026-10-03T00:00:00Z'),
    });
    expect((await service.getCoverage(input)).status).toBe('full');
    prisma.aiCostMetricsBoundary.findUniqueOrThrow.mockResolvedValueOnce({
      metricsStartAt: new Date('2026-10-05T12:00:00Z'), captureActivatedAt: null,
    });
    expect((await service.getCoverage(input)).status).toBe('unavailable');
  });

  it('caps future coverage at one fixed asOf and leaves wholly future ranges unavailable', async () => {
    const fixed = new AiCostLedgerService(prisma as never, {
      now: () => new Date('2026-10-05T12:00:00Z'),
    } as never);
    prisma.aiCostMetricsBoundary.findUniqueOrThrow.mockResolvedValue({
      metricsStartAt: new Date('2026-10-04T00:00:00Z'),
      captureActivatedAt: new Date('2026-10-04T00:00:00Z'),
    });
    const range = {
      from: new Date('2026-10-05T00:00:00Z'), toExclusive: new Date('2026-10-06T00:00:00Z'),
    };
    const result = await fixed.getCoverage(range);
    expect(result.status).toBe('partial');
    expect(result.actualCoveredRange).toEqual({
      from: range.from, toExclusive: new Date('2026-10-05T12:00:00Z'),
    });
    prisma.aiCostIntent.count.mockResolvedValueOnce(1);
    expect((await fixed.getCoverage(range)).status).toBe('unresolved');
    const future = await fixed.getCoverage({
      from: new Date('2026-10-06T00:00:00Z'), toExclusive: new Date('2026-10-07T00:00:00Z'),
    });
    expect(future.status).toBe('unavailable');
    expect(future.actualCoveredRange).toBeNull();
  });
});

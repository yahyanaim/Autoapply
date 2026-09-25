import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  AiMetricsReadService,
  MAX_AI_METRICS_RANGE_DAYS,
} from './ai-metrics-read.service';

describe('AiMetricsReadService', () => {
  const prisma = {
    aIRequest: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  let service: AiMetricsReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.aIRequest.findMany.mockResolvedValue([]);
    service = new AiMetricsReadService(prisma as unknown as PrismaService);
  });

  it('aggregates request volume and recorded estimated USD cost into UTC days', async () => {
    prisma.aIRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        createdAt: new Date('2026-09-23T23:59:59.999Z'),
        cost: 0.1250014,
      },
      {
        id: 'request-2',
        createdAt: new Date('2026-09-24T00:00:00.000Z'),
        cost: null,
      },
      {
        id: 'request-3',
        createdAt: new Date('2026-09-24T12:00:00.000Z'),
        cost: 0.25,
      },
    ]);

    await expect(
      service.getEstimatedCostMetrics({
        from: new Date('2026-09-23T00:00:00.000Z'),
        toExclusive: new Date('2026-09-25T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      costType: 'estimated',
      currency: 'usd',
      requestCount: 3,
      costedRequestCount: 2,
      estimatedCostUsd: 0.375001,
      daily: [
        {
          day: '2026-09-23',
          requestCount: 1,
          costedRequestCount: 1,
          estimatedCostUsd: 0.125001,
        },
        {
          day: '2026-09-24',
          requestCount: 2,
          costedRequestCount: 1,
          estimatedCostUsd: 0.25,
        },
      ],
    });
  });

  it('returns a bounded zero-filled daily series for an empty period', async () => {
    const result = await service.getEstimatedCostMetrics({
      from: new Date('2026-09-24T00:00:00.000Z'),
      toExclusive: new Date('2026-09-26T00:00:00.000Z'),
    });

    expect(result).toEqual({
      costType: 'estimated',
      currency: 'usd',
      requestCount: 0,
      costedRequestCount: 0,
      estimatedCostUsd: 0,
      daily: [
        {
          day: '2026-09-24',
          requestCount: 0,
          costedRequestCount: 0,
          estimatedCostUsd: 0,
        },
        {
          day: '2026-09-25',
          requestCount: 0,
          costedRequestCount: 0,
          estimatedCostUsd: 0,
        },
      ],
    });
  });

  it.each([
    [
      new Date('2026-09-24T01:00:00.000Z'),
      new Date('2026-09-25T00:00:00.000Z'),
    ],
    [
      new Date('2026-09-25T00:00:00.000Z'),
      new Date('2026-09-24T00:00:00.000Z'),
    ],
    [
      new Date('2026-01-01T00:00:00.000Z'),
      new Date(
        Date.UTC(2026, 0, 1 + MAX_AI_METRICS_RANGE_DAYS + 1),
      ),
    ],
  ])('rejects invalid, non-UTC, reversed, or excessive ranges', async (from, toExclusive) => {
    await expect(
      service.getEstimatedCostMetrics({ from, toExclusive }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.aIRequest.findMany).not.toHaveBeenCalled();
  });

  it('uses strict bounded cursor batches without content, provider, user, or write access', async () => {
    const firstBatch = Array.from({ length: 500 }, (_, index) => ({
      id: `request-${index.toString().padStart(4, '0')}`,
      createdAt: new Date('2026-09-24T12:00:00.000Z'),
      cost: 0.001,
    }));
    prisma.aIRequest.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([]);

    const result = await service.getEstimatedCostMetrics({
      from: new Date('2026-09-24T00:00:00.000Z'),
      toExclusive: new Date('2026-09-25T00:00:00.000Z'),
    });

    expect(result.requestCount).toBe(500);
    expect(prisma.aIRequest.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.aIRequest.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        createdAt: {
          gte: new Date('2026-09-24T00:00:00.000Z'),
          lt: new Date('2026-09-25T00:00:00.000Z'),
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
      select: { id: true, createdAt: true, cost: true },
    });
    expect(prisma.aIRequest.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: 'request-0499' },
        skip: 1,
        take: 500,
      }),
    );
    expect(prisma.aIRequest.create).not.toHaveBeenCalled();
    expect(prisma.aIRequest.update).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /provider|model|prompt|inputHash|userId|email|token|credential|secret|resume|cv/i,
    );
  });
});

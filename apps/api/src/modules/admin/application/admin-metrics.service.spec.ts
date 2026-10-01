import { BadRequestException } from '@nestjs/common';
import { AdminMetricsService } from './admin-metrics.service';

describe('AdminMetricsService', () => {
  const billing = {
    getCurrentMetrics: jest.fn(),
    getHistoricalMetrics: jest.fn(),
  };
  const ai = {
    getEstimatedCostMetrics: jest.fn(),
  };
  let service: AdminMetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    billing.getCurrentMetrics.mockResolvedValue({
      asOf: new Date('2026-09-25T12:00:00.000Z'),
      currency: 'usd',
      activePaidSubscriptions: 3,
      activePaidSubscriptionsByPlan: { pro: 2, premium: 1 },
      monthlyRecurringRevenueMinor: 8_700,
    });
    billing.getHistoricalMetrics.mockResolvedValue({
      historyAvailableFrom: new Date('2026-09-24T12:00:00.000Z'),
      requestedRangeStartsBeforeHistory: true,
      actualCoveredRange: {
        from: new Date('2026-09-24T12:00:00.000Z'),
        toExclusive: new Date('2026-09-26T00:00:00.000Z'),
      },
      totals: {
        newPaidSubscriptions: 1,
        expansionMrrMinor: 3_000,
        contractionMrrMinor: 0,
        churnCount: 1,
        churnedMrrMinor: 1_900,
        reactivationCount: 0,
      },
      daily: [],
    });
    ai.getEstimatedCostMetrics.mockResolvedValue({
      costType: 'estimated',
      currency: 'usd',
      requestCount: 4,
      costedRequestCount: 3,
      estimatedCostUsd: 0.75,
      daily: [],
    });
    service = new AdminMetricsService(billing as never, ai as never);
  });

  it('delegates once to each owning service with strict inclusive UTC days', async () => {
    await expect(
      service.getMetrics({ from: '2026-09-23', to: '2026-09-25' }),
    ).resolves.toEqual({
      period: {
        from: '2026-09-23',
        to: '2026-09-25',
        timeZone: 'UTC',
        maximumDays: 90,
      },
      billing: {
        asOf: '2026-09-25T12:00:00.000Z',
        currency: 'usd',
        activePaidSubscriptions: 3,
        activePaidSubscriptionsByPlan: { pro: 2, premium: 1 },
        monthlyRecurringRevenueMinor: 8_700,
        history: {
          historyAvailableFrom: '2026-09-24T12:00:00.000Z',
          requestedRangeStartsBeforeHistory: true,
          actualCoveredRange: {
            from: '2026-09-24T12:00:00.000Z',
            toExclusive: '2026-09-26T00:00:00.000Z',
          },
          totals: {
            newPaidSubscriptions: 1,
            expansionMrrMinor: 3_000,
            contractionMrrMinor: 0,
            churnCount: 1,
            churnedMrrMinor: 1_900,
            reactivationCount: 0,
          },
          daily: [],
        },
      },
      ai: {
        costType: 'estimated',
        currency: 'usd',
        requestCount: 4,
        costedRequestCount: 3,
        estimatedCostUsd: 0.75,
        daily: [],
      },
    });
    expect(billing.getCurrentMetrics).toHaveBeenCalledTimes(1);
    expect(billing.getHistoricalMetrics).toHaveBeenCalledWith({
      from: new Date('2026-09-23T00:00:00.000Z'),
      toExclusive: new Date('2026-09-26T00:00:00.000Z'),
    });
    expect(ai.getEstimatedCostMetrics).toHaveBeenCalledWith({
      from: new Date('2026-09-23T00:00:00.000Z'),
      toExclusive: new Date('2026-09-26T00:00:00.000Z'),
    });
  });

  it.each([
    [{ from: '2026-09-25', to: '2026-09-24' }],
    [{ from: '2026-02-30', to: '2026-03-01' }],
    [{ from: '2026-01-01T00:00:00.000Z', to: '2026-01-02' }],
    [{ from: '2026-01-01', to: '2026-04-01' }],
  ])('fails closed for invalid or excessive UTC ranges', async (input) => {
    await expect(service.getMetrics(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(billing.getCurrentMetrics).not.toHaveBeenCalled();
    expect(billing.getHistoricalMetrics).not.toHaveBeenCalled();
    expect(ai.getEstimatedCostMetrics).not.toHaveBeenCalled();
  });

  it('serializes an entirely unavailable pre-history range without fabricated totals', async () => {
    billing.getHistoricalMetrics.mockResolvedValueOnce({
      historyAvailableFrom: new Date('2026-09-25T12:00:00.000Z'),
      requestedRangeStartsBeforeHistory: true,
      actualCoveredRange: null,
      totals: null,
      daily: [],
    });

    const result = await service.getMetrics({
      from: '2026-09-01',
      to: '2026-09-02',
    });

    expect(result.billing.history).toEqual({
      historyAvailableFrom: '2026-09-25T12:00:00.000Z',
      requestedRangeStartsBeforeHistory: true,
      actualCoveredRange: null,
      totals: null,
      daily: [],
    });
  });

  it('returns aggregate-only data without direct persistence or sensitive fields', async () => {
    const result = await service.getMetrics({
      from: '2026-09-25',
      to: '2026-09-25',
    });

    expect(JSON.stringify(result)).not.toMatch(
      /stripe|invoice|customer|email|userId|provider|model|prompt|resume|cv|token|credential|secret|paymentInstrument/i,
    );
  });
});

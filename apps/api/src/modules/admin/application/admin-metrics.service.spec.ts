import { BadRequestException } from '@nestjs/common';
import { AdminMetricsService } from './admin-metrics.service';

describe('AdminMetricsService', () => {
  const billing = {
    getCurrentMetrics: jest.fn(),
    getHistoricalMetrics: jest.fn(),
  };
  const ai = {
    getEstimatedCostMetrics: jest.fn(),
    getEstimatedCostMetricsForFinancialWindow: jest.fn(),
  };
  const financials = { getMetrics: jest.fn() };
  const stripeFees = { getMetrics: jest.fn() };
  const completeness = { getCoverage: jest.fn() };
  const aiCostLedger = { getCoverage: jest.fn() };
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
    financials.getMetrics.mockResolvedValue({
      metricsStartAt: new Date('2026-09-24T12:34:56.000Z'),
      requestedRangeStartsBeforeMetrics: true,
      actualCoveredRange: {
        from: new Date('2026-09-24T12:34:56.000Z'),
        toExclusive: new Date('2026-09-26T00:00:00.000Z'),
      },
      currency: 'usd',
      totals: { grossRevenueMinor: 6_800, successfulPaymentCount: 2 },
      daily: [
        {
          day: '2026-09-24',
          coverage: 'partial',
          grossRevenueMinor: 6_800,
          successfulPaymentCount: 2,
        },
      ],
    });
    stripeFees.getMetrics.mockResolvedValue({
      metricsStartAt: new Date('2026-09-24T12:34:56.000Z'),
      requestedRangeStartsBeforeMetrics: true,
      actualCoveredRange: {
        from: new Date('2026-09-24T12:34:56.000Z'),
        toExclusive: new Date('2026-09-26T00:00:00.000Z'),
      },
      currency: 'usd',
      totals: { feeMinor: 42, feeEffectCount: 1 },
      daily: [{ day: '2026-09-24', coverage: 'partial', feeMinor: 42, feeEffectCount: 1 }],
    });
    ai.getEstimatedCostMetricsForFinancialWindow.mockResolvedValue({
      costType: 'estimated',
      currency: 'usd',
      requestCount: 3,
      costedRequestCount: 2,
      estimatedCostUsd: 0.5,
      daily: [
        {
          day: '2026-09-24',
          requestCount: 3,
          costedRequestCount: 2,
          estimatedCostUsd: 0.5,
        },
      ],
    });
    const coverage = {
      boundary: new Date('2026-09-24T12:34:56.000Z'),
      activationAt: new Date('2026-09-24T12:35:00.000Z'),
      asOf: new Date('2026-09-25T12:00:00.000Z'),
      requestedRange: { from: new Date('2026-09-23T00:00:00.000Z'),
        toExclusive: new Date('2026-09-26T00:00:00.000Z') },
      actualCoveredRange: { from: new Date('2026-09-24T12:35:00.000Z'),
        toExclusive: new Date('2026-09-26T00:00:00.000Z') },
      status: 'partial',
      providerReference: 'ch_private',
    };
    completeness.getCoverage.mockResolvedValue({ ...coverage,
      unresolvedCaseCount: 0, evidencedZeroCount: 1 });
    aiCostLedger.getCoverage.mockResolvedValue({ ...coverage,
      unresolvedRequestCount: 0, costType: 'estimated', userId: 'private-user' });
    service = new AdminMetricsService(
      billing as never,
      financials as never,
      ai as never,
      stripeFees as never,
      completeness as never,
      aiCostLedger as never,
    );
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
      financialEvidenceCoverage: {
        status: 'partial', boundary: '2026-09-24T12:34:56.000Z',
        activationAt: '2026-09-24T12:35:00.000Z', asOf: '2026-09-25T12:00:00.000Z',
        requestedRange: { from: '2026-09-23T00:00:00.000Z', toExclusive: '2026-09-26T00:00:00.000Z' },
        actualCoveredRange: { from: '2026-09-24T12:35:00.000Z', toExclusive: '2026-09-26T00:00:00.000Z' },
        unresolvedCaseCount: 0, evidencedZeroCount: 1,
      },
      estimatedAiCostCoverage: {
        status: 'partial', boundary: '2026-09-24T12:34:56.000Z',
        activationAt: '2026-09-24T12:35:00.000Z', asOf: '2026-09-25T12:00:00.000Z',
        requestedRange: { from: '2026-09-23T00:00:00.000Z', toExclusive: '2026-09-26T00:00:00.000Z' },
        actualCoveredRange: { from: '2026-09-24T12:35:00.000Z', toExclusive: '2026-09-26T00:00:00.000Z' },
        unresolvedRequestCount: 0, costType: 'estimated',
      },
      financials: {
        metricsStartAt: '2026-09-24T12:34:56.000Z',
        requestedRangeStartsBeforeMetrics: true,
        actualCoveredRange: {
          from: '2026-09-24T12:34:56.000Z',
          toExclusive: '2026-09-26T00:00:00.000Z',
        },
        currency: 'usd',
        totals: {
          grossRevenueMinor: 6_800,
          successfulPaymentCount: 2,
          estimatedAiCostUsd: 0.5,
          costedRequestCount: 2,
        },
        daily: [
          {
            day: '2026-09-24',
            coverage: 'partial',
            grossRevenueMinor: 6_800,
            successfulPaymentCount: 2,
            estimatedAiCostUsd: 0.5,
            costedRequestCount: 2,
          },
        ],
      },
      stripeFees: {
        metricsStartAt: '2026-09-24T12:34:56.000Z',
        requestedRangeStartsBeforeMetrics: true,
        actualCoveredRange: {
          from: '2026-09-24T12:34:56.000Z',
          toExclusive: '2026-09-26T00:00:00.000Z',
        },
        currency: 'usd',
        totals: { feeMinor: 42, feeEffectCount: 1 },
        daily: [{ day: '2026-09-24', coverage: 'partial', feeMinor: 42, feeEffectCount: 1 }],
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
    expect(financials.getMetrics).toHaveBeenCalledWith({
      from: new Date('2026-09-23T00:00:00.000Z'),
      toExclusive: new Date('2026-09-26T00:00:00.000Z'),
    });
    expect(completeness.getCoverage).toHaveBeenCalledWith({
      from: new Date('2026-09-23T00:00:00.000Z'),
      toExclusive: new Date('2026-09-26T00:00:00.000Z'),
    });
    expect(aiCostLedger.getCoverage).toHaveBeenCalledWith({
      from: new Date('2026-09-23T00:00:00.000Z'),
      toExclusive: new Date('2026-09-26T00:00:00.000Z'),
    });
    expect(ai.getEstimatedCostMetricsForFinancialWindow).toHaveBeenCalledWith({
      from: new Date('2026-09-24T12:34:56.000Z'),
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
    expect(financials.getMetrics).not.toHaveBeenCalled();
    expect(ai.getEstimatedCostMetricsForFinancialWindow).not.toHaveBeenCalled();
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

  it('reports pre-boundary financial data as unavailable without querying AI history', async () => {
    financials.getMetrics.mockResolvedValueOnce({
      metricsStartAt: new Date('2026-09-25T12:00:00.000Z'),
      requestedRangeStartsBeforeMetrics: true,
      actualCoveredRange: null,
      currency: 'usd',
      totals: null,
      daily: [],
    });
    const result = await service.getMetrics({
      from: '2026-09-01',
      to: '2026-09-02',
    });
    expect(result.financials).toEqual({
      metricsStartAt: '2026-09-25T12:00:00.000Z',
      requestedRangeStartsBeforeMetrics: true,
      actualCoveredRange: null,
      currency: 'usd',
      totals: null,
      daily: [],
    });
    expect(ai.getEstimatedCostMetricsForFinancialWindow).not.toHaveBeenCalled();
  });

  it('returns aggregate-only data without direct persistence or sensitive fields', async () => {
    const result = await service.getMetrics({
      from: '2026-09-25',
      to: '2026-09-25',
    });

    expect(JSON.stringify(result)).not.toMatch(
      /txn_[a-z0-9]+|in_[a-z0-9]+|cus_[a-z0-9]+|customer|email|userId|provider|model|prompt|resume|cv|token|credential|secret|paymentInstrument/i,
    );
  });

  it('allow-lists Stripe fee fields even if the owning reader returns sensitive extras', async () => {
    stripeFees.getMetrics.mockResolvedValueOnce({
      metricsStartAt: new Date('2026-09-24T12:34:56.000Z'),
      requestedRangeStartsBeforeMetrics: false,
      actualCoveredRange: {
        from: new Date('2026-09-24T12:34:56.000Z'),
        toExclusive: new Date('2026-09-26T00:00:00.000Z'),
        providerResponse: 'top-secret-coverage',
      },
      currency: 'usd',
      totals: { feeMinor: 42, feeEffectCount: 1, balanceTransactionId: 'txn_topsecret' },
      daily: [{
        day: '2026-09-24', coverage: 'partial', feeMinor: 42, feeEffectCount: 1,
        customerId: 'cus_topsecret', metadata: { token: 'daily-secret' },
      }],
      stripeEventId: 'evt_topsecret',
      credentials: 'top-secret-credential',
    });

    const result = await service.getMetrics({ from: '2026-09-24', to: '2026-09-25' });
    expect(result.stripeFees).toEqual({
      metricsStartAt: '2026-09-24T12:34:56.000Z',
      requestedRangeStartsBeforeMetrics: false,
      actualCoveredRange: {
        from: '2026-09-24T12:34:56.000Z',
        toExclusive: '2026-09-26T00:00:00.000Z',
      },
      currency: 'usd',
      totals: { feeMinor: 42, feeEffectCount: 1 },
      daily: [{ day: '2026-09-24', coverage: 'partial', feeMinor: 42, feeEffectCount: 1 }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /top-secret|topsecret|daily-secret|balanceTransactionId|customerId|metadata|credentials|stripeEventId/i,
    );
  });

  it('allow-lists every owning result and nested daily row', async () => {
    const privateValue = 'synthetic-private-marker';
    const current = await billing.getCurrentMetrics();
    billing.getCurrentMetrics.mockResolvedValueOnce({ ...current,
      providerReference: privateValue,
      activePaidSubscriptionsByPlan: { ...current.activePaidSubscriptionsByPlan, userId: privateValue },
    });
    const history = await billing.getHistoricalMetrics();
    billing.getHistoricalMetrics.mockResolvedValueOnce({ ...history,
      paymentId: privateValue,
      totals: { ...history.totals, email: privateValue },
      actualCoveredRange: { ...history.actualCoveredRange, token: privateValue },
      daily: [{
        day: '2026-09-24', coverage: 'partial', activePaidSubscriptions: 3,
        activePaidSubscriptionsByPlan: { pro: 2, premium: 1, email: privateValue },
        monthlyRecurringRevenueMinor: 8_700, newPaidSubscriptions: 1,
        expansionMrrMinor: 3_000, contractionMrrMinor: 0, churnCount: 1,
        churnedMrrMinor: 1_900, reactivationCount: 0,
        providerPayload: privateValue,
      }],
    });
    const aiResult = await ai.getEstimatedCostMetrics();
    ai.getEstimatedCostMetrics.mockResolvedValueOnce({ ...aiResult,
      prompt: privateValue,
      daily: [{ day: '2026-09-24', requestCount: 4, costedRequestCount: 3,
        estimatedCostUsd: 0.75, cv: privateValue }],
    });
    const financialResult = await financials.getMetrics();
    financials.getMetrics.mockResolvedValueOnce({ ...financialResult,
      stripeSecret: privateValue,
      actualCoveredRange: { ...financialResult.actualCoveredRange, token: privateValue },
      totals: { ...financialResult.totals, customerId: privateValue },
      daily: financialResult.daily.map((entry: Record<string, unknown>) => ({
        ...entry, paymentId: privateValue,
      })),
    });
    const aiFinancial = await ai.getEstimatedCostMetricsForFinancialWindow();
    ai.getEstimatedCostMetricsForFinancialWindow.mockResolvedValueOnce({ ...aiFinancial,
      modelPayload: privateValue,
      daily: aiFinancial.daily.map((entry: Record<string, unknown>) => ({
        ...entry, credential: privateValue,
      })),
    });
    const feeResult = await stripeFees.getMetrics();
    stripeFees.getMetrics.mockResolvedValueOnce({ ...feeResult,
      providerReference: privateValue,
      daily: feeResult.daily.map((entry: Record<string, unknown>) => ({
        ...entry, providerReference: privateValue,
      })),
    });
    const financialCoverage = await completeness.getCoverage();
    completeness.getCoverage.mockResolvedValueOnce({ ...financialCoverage,
      providerReference: privateValue,
      requestedRange: { ...financialCoverage.requestedRange, token: privateValue },
      actualCoveredRange: { ...financialCoverage.actualCoveredRange, token: privateValue },
    });
    const costCoverage = await aiCostLedger.getCoverage();
    aiCostLedger.getCoverage.mockResolvedValueOnce({ ...costCoverage,
      userId: privateValue,
      requestedRange: { ...costCoverage.requestedRange, token: privateValue },
      actualCoveredRange: { ...costCoverage.actualCoveredRange, token: privateValue },
    });

    const result = await service.getMetrics({ from: '2026-09-24', to: '2026-09-25' });
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(result.billing.history.daily).toHaveLength(1);
    expect(result.ai.daily).toHaveLength(1);
    expect(result.financials.daily).toHaveLength(1);
    expect(result.stripeFees.daily).toHaveLength(1);
  });
});

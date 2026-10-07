import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView, setFormValue } from '@/test/render';
import { AdminConsoleShell } from './AdminConsoleShell';
import { AdminMetricsPage } from './AdminMetricsPage';

const { metrics } = vi.hoisted(() => ({ metrics: vi.fn() }));

vi.mock('@/lib/api/admin-api-client', () => ({
  adminApiClient: { adminConsole: { metrics } },
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/console/metrics',
}));

const safeResponse = {
  period: {
    from: '2026-09-01',
    to: '2026-09-25',
    timeZone: 'UTC' as const,
    maximumDays: 90 as const,
  },
  billing: {
    asOf: '2026-09-25T12:00:00.000Z',
    currency: 'usd' as const,
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
        reactivationCount: 1,
      },
      daily: [
        {
          day: '2026-09-24',
          coverage: 'partial' as const,
          activePaidSubscriptions: 3,
          activePaidSubscriptionsByPlan: { pro: 2, premium: 1 },
          monthlyRecurringRevenueMinor: 8_700,
          newPaidSubscriptions: 1,
          expansionMrrMinor: 3_000,
          contractionMrrMinor: 0,
          churnCount: 1,
          churnedMrrMinor: 1_900,
          reactivationCount: 1,
        },
      ],
    },
  },
  ai: {
    costType: 'estimated' as const,
    currency: 'usd' as const,
    requestCount: 4,
    costedRequestCount: 3,
    estimatedCostUsd: 0.75,
    daily: [
      {
        day: '2026-09-24',
        requestCount: 4,
        costedRequestCount: 3,
        estimatedCostUsd: 0.75,
      },
    ],
  },
  financialEvidenceCoverage: {
    status: 'unresolved' as const,
    boundary: '2026-09-24T12:34:56.000Z',
    activationAt: '2026-09-24T12:35:00.000Z',
    asOf: '2026-09-25T12:00:00.000Z',
    requestedRange: { from: '2026-09-01T00:00:00.000Z', toExclusive: '2026-09-26T00:00:00.000Z' },
    actualCoveredRange: { from: '2026-09-24T12:35:00.000Z', toExclusive: '2026-09-26T00:00:00.000Z' },
    unresolvedCaseCount: 1,
    evidencedZeroCount: 0,
  },
  estimatedAiCostCoverage: {
    status: 'partial' as const,
    boundary: '2026-09-24T12:34:56.000Z',
    activationAt: '2026-09-24T12:35:00.000Z',
    asOf: '2026-09-25T12:00:00.000Z',
    requestedRange: { from: '2026-09-01T00:00:00.000Z', toExclusive: '2026-09-26T00:00:00.000Z' },
    actualCoveredRange: { from: '2026-09-24T12:35:00.000Z', toExclusive: '2026-09-26T00:00:00.000Z' },
    unresolvedRequestCount: 0,
    costType: 'estimated' as const,
  },
  financials: {
    metricsStartAt: '2026-09-24T12:34:56.000Z',
    requestedRangeStartsBeforeMetrics: true,
    actualCoveredRange: {
      from: '2026-09-24T12:34:56.000Z',
      toExclusive: '2026-09-26T00:00:00.000Z',
    },
    currency: 'usd' as const,
    totals: {
      grossRevenueMinor: 6_800,
      successfulPaymentCount: 2,
      estimatedAiCostUsd: 0.5,
      costedRequestCount: 2,
    },
    daily: [
      {
        day: '2026-09-24',
        coverage: 'partial' as const,
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
    currency: 'usd' as const,
    totals: { feeMinor: -25, feeEffectCount: 2 },
    daily: [{ day: '2026-09-24', coverage: 'partial' as const, feeMinor: -25, feeEffectCount: 2 }],
  },
  recordedFinancials: {
    status: 'partial' as const,
    currency: 'usd' as const,
    costType: 'estimated' as const,
    asOf: '2026-09-25T12:00:00.000Z',
    requestedRange: { from: '2026-09-01T00:00:00.000Z', toExclusive: '2026-09-26T00:00:00.000Z' },
    actualCoveredRange: { from: '2026-09-24T12:35:00.000Z', toExclusive: '2026-09-25T12:00:00.000Z' },
    totals: { grossRevenueMinor: 6_800, refundAdjustmentMinor: -1_000,
      disputeWithdrawalMinor: -500, disputeReinstatementMinor: 200,
      recordedStripeFeeMinor: -25, recordedNetRevenueMinor: 5_525,
      estimatedAiCostMicroUsd: 500_000, estimatedContributionMarginMicroUsd: 54_750_000 },
    daily: [{ day: '2026-09-24', coverage: 'partial' as const,
      grossRevenueMinor: 6_800, refundAdjustmentMinor: -1_000,
      disputeWithdrawalMinor: -500, disputeReinstatementMinor: 200,
      recordedStripeFeeMinor: -25, recordedNetRevenueMinor: 5_525,
      estimatedAiCostMicroUsd: 500_000, estimatedContributionMarginMicroUsd: 54_750_000 }],
  },
};

const zeroMetricsResponse = {
  ...safeResponse,
  period: { ...safeResponse.period, from: '2026-09-25', to: '2026-09-25' },
  billing: {
    ...safeResponse.billing,
    activePaidSubscriptions: 0,
    activePaidSubscriptionsByPlan: { pro: 0, premium: 0 },
    monthlyRecurringRevenueMinor: 0,
    history: { ...safeResponse.billing.history, totals: {
      newPaidSubscriptions: 0, expansionMrrMinor: 0,
      contractionMrrMinor: 0, churnCount: 0, churnedMrrMinor: 0,
      reactivationCount: 0,
    }, daily: [] },
  },
  ai: { ...safeResponse.ai, requestCount: 0, costedRequestCount: 0,
    estimatedCostUsd: 0, daily: [] },
  financials: { ...safeResponse.financials, totals: {
    grossRevenueMinor: 0, successfulPaymentCount: 0,
    estimatedAiCostUsd: 0, costedRequestCount: 0,
  }, daily: [] },
  stripeFees: { ...safeResponse.stripeFees,
    totals: { feeMinor: 0, feeEffectCount: 0 }, daily: [] },
  recordedFinancials: {
    ...safeResponse.recordedFinancials,
    status: 'full' as const,
    asOf: '2026-09-27T00:00:00.000Z',
    requestedRange: { from: '2026-09-25T00:00:00.000Z',
      toExclusive: '2026-09-26T00:00:00.000Z' },
    actualCoveredRange: { from: '2026-09-25T00:00:00.000Z',
      toExclusive: '2026-09-26T00:00:00.000Z' },
    totals: { grossRevenueMinor: 0, refundAdjustmentMinor: 0,
      disputeWithdrawalMinor: 0, disputeReinstatementMinor: 0,
      recordedStripeFeeMinor: 0, recordedNetRevenueMinor: 0,
      estimatedAiCostMicroUsd: 0, estimatedContributionMarginMicroUsd: 0 },
    daily: [],
  },
};

function view(node: ReactNode) {
  return renderView(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonWithText(container: Element, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === text,
  );
  if (!button) throw new Error(`Expected button: ${text}`);
  return button;
}

describe('AdminMetricsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    metrics.mockResolvedValue(safeResponse);
  });

  it('renders only safe current billing and estimated AI aggregates', async () => {
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();

    expect(rendered.container.textContent).toContain('Active paid subscriptions');
    expect(rendered.container.textContent).toContain('$87.00');
    expect(rendered.container.textContent).toContain('Estimated AI cost');
    expect(rendered.container.textContent).toContain('Daily AI request volume');
    expect(rendered.container.textContent).toContain('Future-only financial metrics');
    expect(rendered.container.textContent).toContain('Gross revenue');
    expect(rendered.container.textContent).toContain('Successful payments');
    expect(rendered.container.textContent).toContain('Recorded Stripe fees');
    expect(rendered.container.textContent).toContain('Recorded Net Revenue');
    expect(rendered.container.textContent).toContain('Estimated Contribution Margin');
    expect(rendered.container.textContent).toContain('$55.25');
    expect(rendered.container.textContent).toContain('$54.75');
    expect(rendered.required('[aria-label="Daily recorded net revenue and estimated contribution margin"]').textContent).toContain('partial');
    expect(rendered.container.textContent).toContain('Recorded financial evidence: unresolved');
    expect(rendered.container.textContent).toContain('Estimated AI cost coverage: partial');
    expect(rendered.container.textContent).toContain('Not payout or bank reconciliation');
    expect(rendered.container.textContent).toContain('Fee effects');
    expect(rendered.container.textContent).toContain('-$0.25');
    expect(rendered.required('[aria-label="Daily recorded Stripe fees"]').textContent).toContain('partial');
    expect(rendered.container.textContent).toContain('$68.00');
    expect(rendered.container.textContent).toContain(
      'data before the metrics boundary is unavailable',
    );
    expect(
      rendered.required('[aria-label="Daily future financial metrics"]'),
    ).toBeTruthy();
    expect(rendered.container.textContent).toContain('Subscription lifecycle history');
    expect(rendered.container.textContent).toContain(
      'history before the availability timestamp is unavailable',
    );
    expect(
      rendered.required('[aria-label="Daily subscription lifecycle metrics"]'),
    ).toBeTruthy();
    expect(rendered.required('[aria-label="Daily AI metrics chart"]')).toBeTruthy();
    expect(rendered.container.textContent).not.toMatch(
      /txn_[a-z0-9]+|in_[a-z0-9]+|cus_[a-z0-9]+|customer|email|userId|provider|model|prompt|resume|cv|token|credential|secret|payment instrument/i,
    );
    expect(metrics).toHaveBeenCalledTimes(1);
    expect(
      Object.keys(
        (await import('@/lib/api/admin-api-client')).adminApiClient.adminConsole,
      ),
    ).toEqual(['metrics']);
    rendered.cleanup();
  });

  it.each([
    ['unavailable', 'Combined financial metrics are unavailable before all future-only capture boundaries activate.'],
    ['unresolved', 'Combined monetary totals are withheld, not zero.'],
  ] as const)('withholds monetary cards when combined coverage is %s', async (status, message) => {
    metrics.mockResolvedValueOnce({ ...zeroMetricsResponse, recordedFinancials: {
      ...zeroMetricsResponse.recordedFinancials, status,
      actualCoveredRange: status === 'unavailable' ? null : zeroMetricsResponse.recordedFinancials.actualCoveredRange,
      totals: null, daily: [],
    } });
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(rendered.container.textContent).toContain(message);
    expect(rendered.container.textContent).not.toContain('No metrics recorded');
    expect(rendered.container.textContent).not.toContain('evt_private');
    rendered.cleanup();
  });

  it('labels a fully covered combined range without implying reconciliation', async () => {
    metrics.mockResolvedValueOnce({ ...safeResponse, recordedFinancials: {
      ...safeResponse.recordedFinancials, status: 'full' as const,
    } });
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(rendered.container.textContent).toContain('full coverage');
    expect(rendered.container.textContent).toContain('Not reconciled revenue');
    expect(rendered.container.textContent).toContain('Estimated Contribution Margin');
    rendered.cleanup();
  });

  it('does not show an empty state when only a recorded adjustment remains', async () => {
    metrics.mockResolvedValueOnce({ ...zeroMetricsResponse,
      recordedFinancials: { ...zeroMetricsResponse.recordedFinancials,
        totals: { ...zeroMetricsResponse.recordedFinancials.totals,
          refundAdjustmentMinor: -200, recordedNetRevenueMinor: -200,
          estimatedContributionMarginMicroUsd: -2_000_000 } },
    });
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(rendered.container.textContent).toContain('Recorded Net Revenue');
    expect(rendered.container.textContent).not.toContain('No metrics recorded');
    rendered.cleanup();
  });

  it('does not show an empty state when signed components offset to zero', async () => {
    metrics.mockResolvedValueOnce({ ...zeroMetricsResponse,
      recordedFinancials: { ...zeroMetricsResponse.recordedFinancials,
        totals: { ...zeroMetricsResponse.recordedFinancials.totals,
          disputeWithdrawalMinor: -100, disputeReinstatementMinor: 100 } },
    });
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(rendered.container.textContent).toContain('Recorded Net Revenue');
    expect(rendered.container.textContent).not.toContain('No metrics recorded');
    rendered.cleanup();
  });

  it('shows an empty state for a fully covered range with every metric zero', async () => {
    metrics.mockResolvedValueOnce(zeroMetricsResponse);
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(rendered.container.textContent).toContain('full coverage');
    expect(rendered.container.textContent).toContain('No metrics recorded');
    rendered.cleanup();
  });

  it('does not show an empty state for an all-zero but only partially covered range', async () => {
    metrics.mockResolvedValueOnce({ ...zeroMetricsResponse,
      recordedFinancials: { ...zeroMetricsResponse.recordedFinancials,
        status: 'partial' as const },
    });
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(rendered.container.textContent).toContain('partial coverage');
    expect(rendered.container.textContent).not.toContain('No metrics recorded');
    rendered.cleanup();
  });

  it('does not render a historical table or fabricated zeroes for a fully unavailable period', async () => {
    metrics.mockResolvedValueOnce({
      ...safeResponse,
      billing: {
        ...safeResponse.billing,
        history: {
          historyAvailableFrom: '2026-09-25T12:00:00.000Z',
          requestedRangeStartsBeforeHistory: true,
          actualCoveredRange: null,
          totals: null,
          daily: [],
        },
      },
    });
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();

    expect(rendered.container.textContent).toContain(
      'Historical billing data unavailable',
    );
    expect(
      rendered.container.querySelector(
        '[aria-label="Daily subscription lifecycle metrics"]',
      ),
    ).toBeNull();
    rendered.cleanup();
  });

  it('does not render a financial table or fabricated zeroes before metricsStartAt', async () => {
    metrics.mockResolvedValueOnce({
      ...safeResponse,
      financials: {
        ...safeResponse.financials,
        actualCoveredRange: null,
        totals: null,
        daily: [],
      },
    });
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(rendered.container.textContent).toContain(
      'Financial metrics unavailable',
    );
    expect(
      rendered.container.querySelector(
        '[aria-label="Daily future financial metrics"]',
      ),
    ).toBeNull();
    rendered.cleanup();
  });

  it('keeps wholly pre-boundary fee coverage unavailable rather than showing fabricated zeroes', async () => {
    metrics.mockResolvedValueOnce({
      ...safeResponse,
      stripeFees: {
        ...safeResponse.stripeFees,
        actualCoveredRange: null,
        totals: null,
        daily: [],
      },
    });
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(rendered.container.textContent).toContain('unavailable for this pre-boundary range');
    expect(rendered.container.querySelector('[aria-label="Daily recorded Stripe fees"]')).toBeNull();
    rendered.cleanup();
  });

  it('updates the bounded typed query when the UTC date range changes', async () => {
    const rendered = view(<AdminMetricsPage />);
    await settle();
    await settle();
    metrics.mockClear();

    setFormValue(
      rendered.required<HTMLInputElement>('[aria-label="Metrics UTC from"]'),
      '2026-09-20',
    );
    setFormValue(
      rendered.required<HTMLInputElement>('[aria-label="Metrics UTC to"]'),
      '2026-09-25',
    );
    await settle();
    await settle();

    expect(metrics).toHaveBeenLastCalledWith({
      from: '2026-09-20',
      to: '2026-09-25',
    });
    rendered.cleanup();
  });

  it('renders loading, error retry, and feature-flag-disabled states', async () => {
    metrics.mockReturnValue(new Promise(() => undefined));
    const loading = view(<AdminMetricsPage />);
    expect(loading.required('[aria-label="Loading metrics"]')).toBeTruthy();
    loading.cleanup();

    metrics
      .mockRejectedValueOnce(new Error('safe failure'))
      .mockResolvedValueOnce(safeResponse);
    const error = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(error.container.textContent).toContain('Could not load metrics');
    click(buttonWithText(error.container, 'Retry'));
    await settle();
    await settle();
    expect(error.container.textContent).toContain('Current MRR');
    error.cleanup();

    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'false');
    const disabled = view(
      <AdminConsoleShell>
        <p>Metrics child</p>
      </AdminConsoleShell>,
    );
    expect(disabled.container.textContent).toContain('Admin Console unavailable');
    expect(disabled.container.textContent).not.toContain('Metrics child');
    disabled.cleanup();
  });
});

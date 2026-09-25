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
    expect(rendered.container.textContent).toContain('Subscription lifecycle history');
    expect(rendered.container.textContent).toContain(
      'history before the availability timestamp is unavailable',
    );
    expect(
      rendered.required('[aria-label="Daily subscription lifecycle metrics"]'),
    ).toBeTruthy();
    expect(rendered.required('[aria-label="Daily AI metrics chart"]')).toBeTruthy();
    expect(rendered.container.textContent).not.toMatch(
      /stripe|invoice|customer|email|userId|provider|model|prompt|resume|cv|token|credential|secret|payment instrument|margin/i,
    );
    expect(metrics).toHaveBeenCalledTimes(1);
    expect(
      Object.keys(
        (await import('@/lib/api/admin-api-client')).adminApiClient.adminConsole,
      ),
    ).toEqual(['metrics']);
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

  it('renders loading, zero, error retry, and feature-flag-disabled states', async () => {
    metrics.mockReturnValue(new Promise(() => undefined));
    const loading = view(<AdminMetricsPage />);
    expect(loading.required('[aria-label="Loading metrics"]')).toBeTruthy();
    loading.cleanup();

    metrics.mockResolvedValueOnce({
      ...safeResponse,
      billing: {
        ...safeResponse.billing,
        activePaidSubscriptions: 0,
        activePaidSubscriptionsByPlan: { pro: 0, premium: 0 },
        monthlyRecurringRevenueMinor: 0,
        history: {
          ...safeResponse.billing.history,
          totals: {
            newPaidSubscriptions: 0,
            expansionMrrMinor: 0,
            contractionMrrMinor: 0,
            churnCount: 0,
            churnedMrrMinor: 0,
            reactivationCount: 0,
          },
          daily: [],
        },
      },
      ai: {
        ...safeResponse.ai,
        requestCount: 0,
        costedRequestCount: 0,
        estimatedCostUsd: 0,
        daily: [],
      },
    });
    const zero = view(<AdminMetricsPage />);
    await settle();
    await settle();
    expect(zero.container.textContent).toContain('No metrics recorded');
    zero.cleanup();

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

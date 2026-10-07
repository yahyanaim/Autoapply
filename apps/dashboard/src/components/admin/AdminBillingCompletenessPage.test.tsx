import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView, setFormValue } from '@/test/render';
import { AdminBillingCompletenessPage } from './AdminBillingCompletenessPage';
import { AdminConsoleShell } from './AdminConsoleShell';

const { billingCompleteness } = vi.hoisted(() => ({ billingCompleteness: vi.fn() }));
vi.mock('@/lib/api/admin-api-client', () => ({
  adminApiClient: { adminConsole: { billingCompleteness } },
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/console/billing-completeness' }));

const safe = {
  scanId: 'local_scan1', status: 'completed', reason: null,
  requestedRange: { from: '2026-10-05T00:00:00.000Z', toExclusive: '2026-10-06T00:00:00.000Z' },
  attemptedRange: { from: '2026-10-05T00:00:00.000Z', toExclusive: '2026-10-06T00:00:00.000Z' },
  verifiedCoveredRange: { from: '2026-10-05T00:00:00.000Z', toExclusive: '2026-10-06T00:00:00.000Z' },
  asOf: '2026-10-07T12:00:00.000Z', completedAt: '2026-10-07T12:00:01.000Z',
  scannedEventCount: 1,
  findings: [{ id: 'local_finding1', eventType: 'refund.updated',
    eventAt: '2026-10-05T13:00:00.000Z', finding: 'missing_receipt' }],
  limit: 20, nextCursor: 'local_cursor1',
};
function view(node = <AdminBillingCompletenessPage />) {
  return renderView(<QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })}>{node}</QueryClientProvider>);
}
function button(container: Element, text: string) {
  const found = Array.from(container.querySelectorAll('button'))
    .find((item) => item.textContent === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}

describe('AdminBillingCompletenessPage', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); billingCompleteness.mockResolvedValue(safe); });

  it('renders only safe classifications with typed read-only client data', async () => {
    const rendered = view();
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('missing receipt'));
    expect(rendered.container.textContent).toContain('Financial event checks');
    expect(rendered.container.textContent).toContain('local_finding1');
    expect(rendered.container.textContent).not.toMatch(/evt_private|cus_private|secret|token|prompt|cv|raw payload/i);
    expect(rendered.container.textContent).not.toContain('local_cursor1');
    expect(billingCompleteness).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    expect(Object.keys((await import('@/lib/api/admin-api-client')).adminApiClient.adminConsole)).toEqual(['billingCompleteness']);
    rendered.cleanup();
  });

  it('changes UTC range, pages a durable scan and hides raw cursors', async () => {
    billingCompleteness.mockImplementation(async (params: { cursor?: string }) => params.cursor
      ? { ...safe, findings: [{ ...safe.findings[0], id: 'local_finding2' }], nextCursor: null }
      : safe);
    const rendered = view();
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('local_finding1'));
    click(button(rendered.container, 'Next'));
    await vi.waitFor(() => {
      expect(billingCompleteness).toHaveBeenLastCalledWith(expect.objectContaining({
        scanId: 'local_scan1', cursor: 'local_cursor1', limit: 20,
      }));
      expect(rendered.container.textContent).toContain('local_finding2');
    });
    expect(rendered.container.textContent).not.toContain('local_cursor1');
    click(button(rendered.container, 'Previous'));
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('local_finding1'));
    setFormValue(rendered.required<HTMLInputElement>('input[aria-label="Scan from UTC day"]'), '2026-10-04');
    await vi.waitFor(() => expect(billingCompleteness).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-04' })));
    click(button(rendered.container, 'New scan'));
    await vi.waitFor(() => expect(billingCompleteness.mock.calls.length).toBeGreaterThanOrEqual(4));
    rendered.cleanup();
  });

  it('never calls the API for an invalid range; shows loading, unavailable and retry states', async () => {
    billingCompleteness.mockReturnValueOnce(new Promise(() => undefined));
    const loading = view();
    expect(loading.container.textContent).toContain('Scanning supported events');
    loading.cleanup();

    billingCompleteness.mockResolvedValueOnce({ ...safe, status: 'unavailable', reason: 'provider_window_unavailable',
      attemptedRange: null, verifiedCoveredRange: null, findings: [], nextCursor: null });
    const unavailable = view();
    await vi.waitFor(() => expect(unavailable.container.textContent).toContain('No-discrepancy claim is unavailable'));
    expect(unavailable.container.textContent).not.toContain('No discrepancies in this completed scan');
    unavailable.cleanup();

    billingCompleteness.mockRejectedValueOnce(new Error('synthetic failure')).mockResolvedValueOnce(safe);
    const error = view();
    await vi.waitFor(() => expect(error.container.textContent).toContain('Could not load financial checks'));
    click(button(error.container, 'Retry'));
    await vi.waitFor(() => expect(error.container.textContent).toContain('local_finding1'));
    setFormValue(error.required<HTMLInputElement>('input[aria-label="Scan to UTC day"]'), '2026-11-01');
    expect(error.container.textContent).toContain('Invalid UTC range');
    error.cleanup();
  });

  it('shows clean only for a completed scan with no findings and follows shell feature flag', async () => {
    billingCompleteness.mockResolvedValueOnce({ ...safe, findings: [], nextCursor: null });
    const clean = view();
    await vi.waitFor(() => expect(clean.container.textContent).toContain('No discrepancies in this completed scan'));
    expect(clean.container.textContent).toContain('Stripe event cutoff');
    expect(clean.container.textContent).toContain('separate snapshot for each provider page');
    clean.cleanup();
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'false');
    const before = billingCompleteness.mock.calls.length;
    const disabled = view(<AdminConsoleShell><AdminBillingCompletenessPage /></AdminConsoleShell>);
    expect(disabled.container.textContent).toContain('unavailable');
    expect(billingCompleteness).toHaveBeenCalledTimes(before);
    disabled.cleanup();
  });

  it.each([['failed', 'provider_or_comparison_failure'], ['incomplete', 'provider_page_cap']] as const)(
    'shows an attempted but not verified range for a %s listing', async (status, reason) => {
      billingCompleteness.mockResolvedValueOnce({ ...safe, status, reason,
        verifiedCoveredRange: null, findings: [], nextCursor: null });
      const rendered = view();
      await vi.waitFor(() => expect(rendered.container.textContent).toContain(`${status} scan`));
      expect(rendered.container.textContent).toContain('Attempted:');
      expect(rendered.container.textContent).not.toContain('Verified comparison:');
      expect(rendered.container.textContent).not.toContain('No discrepancies in this completed scan');
      rendered.cleanup();
    },
  );
});

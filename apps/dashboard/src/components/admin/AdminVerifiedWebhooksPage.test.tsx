import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView, setFormValue } from '@/test/render';
import { AdminVerifiedWebhooksPage } from './AdminVerifiedWebhooksPage';
import { AdminConsoleShell } from './AdminConsoleShell';

const { verifiedWebhooks } = vi.hoisted(() => ({ verifiedWebhooks: vi.fn() }));
vi.mock('@/lib/api/admin-api-client', () => ({ adminApiClient: { adminConsole: { verifiedWebhooks } } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/console/verified-webhooks' }));

const safe = {
  coverage: 'partial', coverageStartAt: '2026-10-08T12:00:00.000Z',
  requestedRange: { from: '2026-10-08T00:00:00.000Z', toExclusive: '2026-10-09T00:00:00.000Z' },
  coveredRange: { from: '2026-10-08T12:00:00.000Z', toExclusive: '2026-10-08T13:00:00.000Z' },
  asOf: '2026-10-08T13:00:00.000Z', limit: 20, nextCursor: 'local_cursor1',
  items: [{ id: 'local_delivery1', eventType: 'invoice.payment_failed', status: 'retryable',
    reason: 'provider_unavailable', observedAt: '2026-10-08T12:01:00.000Z',
    finishedAt: '2026-10-08T12:02:00.000Z', resolvedAt: null }],
};
function view(node = <AdminVerifiedWebhooksPage />) {
  return renderView(<QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })}>{node}</QueryClientProvider>);
}
function button(container: Element, label: string) {
  const found = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}

describe('AdminVerifiedWebhooksPage', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); verifiedWebhooks.mockResolvedValue(safe); });

  it('uses only the typed read client and shows safe status and coverage limitations', async () => {
    const rendered = view();
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('local_delivery1'));
    expect(rendered.container.textContent).toContain('retryable');
    expect(rendered.container.textContent).toContain('provider unavailable');
    expect(rendered.container.textContent).toContain('partial local capture coverage');
    expect(rendered.container.textContent).toContain('An absent receipt alone does not prove failure');
    expect(rendered.container.textContent).not.toMatch(/evt_private|cus_private|secret|payload|local_cursor1/i);
    expect(verifiedWebhooks).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    expect(Object.keys((await import('@/lib/api/admin-api-client')).adminApiClient.adminConsole)).toEqual(['verifiedWebhooks']);
    rendered.cleanup();
  });

  it('pages with hidden cursors and resets filters', async () => {
    verifiedWebhooks.mockImplementation(async (params: { cursor?: string }) => params.cursor
      ? { ...safe, items: [{ ...safe.items[0], id: 'local_delivery2' }], nextCursor: null } : safe);
    const rendered = view();
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('local_delivery1'));
    click(button(rendered.container, 'Next'));
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('local_delivery2'));
    expect(rendered.container.textContent).not.toContain('local_cursor1');
    click(button(rendered.container, 'Previous'));
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('local_delivery1'));
    setFormValue(rendered.required<HTMLSelectElement>('select[aria-label="Webhook status"]'), 'unresolved');
    await vi.waitFor(() => expect(verifiedWebhooks).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'unresolved' })));
    rendered.cleanup();
  });

  it('shows loading, unavailable, empty, error and feature-disabled states without mutations', async () => {
    verifiedWebhooks.mockReturnValueOnce(new Promise(() => undefined));
    const loading = view();
    expect(loading.container.textContent).toContain('Loading verified webhook issues');
    loading.cleanup();

    verifiedWebhooks.mockResolvedValueOnce({ ...safe, coverage: 'unavailable', coveredRange: null,
      items: [], nextCursor: null });
    const empty = view();
    await vi.waitFor(() => expect(empty.container.textContent).toContain('No captured issues on this page'));
    expect(empty.container.textContent).toContain('unavailable local capture coverage');
    empty.cleanup();

    verifiedWebhooks.mockRejectedValueOnce(new Error('synthetic failure')).mockResolvedValueOnce(safe);
    const error = view();
    await vi.waitFor(() => expect(error.container.textContent).toContain('Could not load webhook issues'));
    click(button(error.container, 'Retry'));
    await vi.waitFor(() => expect(error.container.textContent).toContain('local_delivery1'));
    error.cleanup();

    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'false');
    const before = verifiedWebhooks.mock.calls.length;
    const disabled = view(<AdminConsoleShell><AdminVerifiedWebhooksPage /></AdminConsoleShell>);
    expect(disabled.container.textContent).toContain('Admin Console unavailable');
    expect(verifiedWebhooks).toHaveBeenCalledTimes(before);
    disabled.cleanup();
  });
});

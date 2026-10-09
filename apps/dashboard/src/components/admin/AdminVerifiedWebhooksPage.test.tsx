import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView, setFormValue } from '@/test/render';
import { AdminVerifiedWebhooksPage } from './AdminVerifiedWebhooksPage';
import { AdminConsoleShell } from './AdminConsoleShell';

const { verifiedWebhooks, issueStepUp, retryVerifiedWebhook } = vi.hoisted(() => ({
  verifiedWebhooks: vi.fn(), issueStepUp: vi.fn(), retryVerifiedWebhook: vi.fn(),
}));
vi.mock('@/lib/api/admin-api-client', () => ({ adminApiClient: { adminConsole: {
  verifiedWebhooks, issueStepUp, retryVerifiedWebhook,
} } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/console/verified-webhooks' }));

const safe = {
  coverage: 'partial', coverageStartAt: '2026-10-08T12:00:00.000Z',
  requestedRange: { from: '2026-10-08T00:00:00.000Z', toExclusive: '2026-10-09T00:00:00.000Z' },
  coveredRange: { from: '2026-10-08T12:00:00.000Z', toExclusive: '2026-10-08T13:00:00.000Z' },
  asOf: '2026-10-08T13:00:00.000Z', limit: 20, nextCursor: 'local_cursor1',
  items: [{ id: 'local_delivery1', eventType: 'invoice.payment_failed', status: 'retryable',
    reason: 'provider_unavailable', observedAt: '2026-10-08T12:01:00.000Z',
    finishedAt: '2026-10-08T12:02:00.000Z', resolvedAt: null,
    retryEligible: false, retryStatus: 'none' }],
};
function view(node = <AdminVerifiedWebhooksPage />, client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })) {
  return renderView(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function button(container: Element, label: string) {
  const found = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}

describe('AdminVerifiedWebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.unstubAllEnvs(); verifiedWebhooks.mockResolvedValue(safe);
    issueStepUp.mockResolvedValue({ proof: 'synthetic-proof', expiresAt: '2026-10-08T13:05:00.000Z' });
    retryVerifiedWebhook.mockResolvedValue({ deliveryId: 'local_delivery1',
      status: 'retry_requested', requestedAt: '2026-10-08T13:00:00.000Z' });
  });

  it('uses only the typed read client and shows safe status and coverage limitations', async () => {
    const rendered = view();
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('local_delivery1'));
    expect(rendered.container.textContent).toContain('retryable');
    expect(rendered.container.textContent).toContain('provider unavailable');
    expect(rendered.container.textContent).toContain('partial local capture coverage');
    expect(rendered.container.textContent).toContain('An absent receipt alone does not prove failure');
    expect(rendered.container.textContent).not.toMatch(/evt_private|cus_private|secret|payload|local_cursor1/i);
    expect(verifiedWebhooks).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    expect(rendered.container.textContent).toContain('Inspection only');
    expect(issueStepUp).not.toHaveBeenCalled();
    expect(retryVerifiedWebhook).not.toHaveBeenCalled();
    rendered.cleanup();
  });

  it('requires confirmation and bound step-up before requesting one locally eligible retry', async () => {
    verifiedWebhooks.mockResolvedValue({ ...safe, items: [{ ...safe.items[0],
      eventType: 'invoice.payment_succeeded', retryEligible: true }] });
    const rendered = view();
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Request retry'));
    click(button(rendered.container, 'Request retry'));
    expect(rendered.container.textContent).toContain('Confirm Billing retry');
    expect(rendered.container.textContent).toContain('invoice.payment_succeeded');
    expect(rendered.container.textContent).toContain('local_delivery1');
    expect(button(rendered.container, 'Confirm retry').hasAttribute('disabled')).toBe(true);
    setFormValue(rendered.required<HTMLInputElement>('input[aria-label="Webhook retry authenticator code"]'), '123456');
    expect(button(rendered.container, 'Confirm retry').hasAttribute('disabled')).toBe(true);
    click(rendered.required<HTMLInputElement>('input[type="checkbox"]'));
    click(button(rendered.container, 'Confirm retry'));
    await vi.waitFor(() => expect(retryVerifiedWebhook).toHaveBeenCalledTimes(1));
    expect(issueStepUp).toHaveBeenCalledWith({ code: '123456', action: 'admin.webhook.retry',
      targetType: 'webhook_delivery', targetId: 'local_delivery1' });
    expect(retryVerifiedWebhook).toHaveBeenCalledWith('local_delivery1', {
      stepUpProof: 'synthetic-proof', idempotencyKey: expect.any(String),
    });
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Retry requested'));
    expect(rendered.container.textContent).not.toContain('synthetic-proof');
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

  it('invalidates a confirmed delivery when pagination removes it', async () => {
    const eligible = { ...safe.items[0], eventType: 'invoice.payment_succeeded', retryEligible: true };
    verifiedWebhooks.mockImplementation(async (params: { cursor?: string }) => params.cursor
      ? { ...safe, items: [{ ...eligible, id: 'local_delivery2', observedAt: '2026-10-08T12:03:00.000Z' }], nextCursor: null }
      : { ...safe, items: [eligible] });
    const rendered = view();
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Request retry'));
    click(button(rendered.container, 'Request retry'));
    setFormValue(rendered.required<HTMLInputElement>('input[aria-label="Webhook retry authenticator code"]'), '123456');
    click(rendered.required<HTMLInputElement>('input[type="checkbox"]'));
    expect(rendered.container.textContent).toContain('Event class: invoice.payment_succeeded');
    expect(rendered.container.textContent).toContain('Observed UTC: 2026-10-08T12:01:00.000Z');
    click(button(rendered.container, 'Next'));
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('local_delivery2'));
    expect(rendered.container.textContent).not.toContain('Confirm Billing retry');
    expect(rendered.container.querySelector('button[type="submit"]')).toBeNull();
    expect(issueStepUp).not.toHaveBeenCalled();
    expect(retryVerifiedWebhook).not.toHaveBeenCalled();
    rendered.cleanup();
  });

  it('invalidates confirmation when refreshed data makes the delivery ineligible', async () => {
    const eligible = { ...safe, items: [{ ...safe.items[0],
      eventType: 'invoice.payment_succeeded', retryEligible: true }] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    verifiedWebhooks.mockResolvedValueOnce(eligible).mockResolvedValueOnce(safe).mockResolvedValueOnce(eligible);
    const rendered = view(<AdminVerifiedWebhooksPage />, client);
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Request retry'));
    click(button(rendered.container, 'Request retry'));
    setFormValue(rendered.required<HTMLInputElement>('input[aria-label="Webhook retry authenticator code"]'), '123456');
    click(rendered.required<HTMLInputElement>('input[type="checkbox"]'));
    await client.invalidateQueries({ queryKey: ['admin-console', 'verified-webhooks'] });
    await vi.waitFor(() => expect(rendered.container.textContent).not.toContain('Confirm Billing retry'));
    expect(issueStepUp).not.toHaveBeenCalled();
    expect(retryVerifiedWebhook).not.toHaveBeenCalled();
    await client.invalidateQueries({ queryKey: ['admin-console', 'verified-webhooks'] });
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Request retry'));
    click(button(rendered.container, 'Request retry'));
    expect(button(rendered.container, 'Confirm retry').hasAttribute('disabled')).toBe(true);
    expect(rendered.required<HTMLInputElement>('input[aria-label="Webhook retry authenticator code"]').value).toBe('');
    rendered.cleanup();
  });

  it('does not submit a stale delivery if pagination changes during step-up issuance', async () => {
    const eligible = { ...safe.items[0], eventType: 'invoice.payment_succeeded', retryEligible: true };
    verifiedWebhooks.mockImplementation(async (params: { cursor?: string }) => params.cursor
      ? { ...safe, items: [{ ...eligible, id: 'local_delivery2' }], nextCursor: null }
      : { ...safe, items: [eligible] });
    let releaseStepUp!: (value: { proof: string; expiresAt: string }) => void;
    issueStepUp.mockImplementationOnce(() => new Promise((resolve) => { releaseStepUp = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    const rendered = view(<AdminVerifiedWebhooksPage />, client);
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Request retry'));
    click(button(rendered.container, 'Request retry'));
    setFormValue(rendered.required<HTMLInputElement>('input[aria-label="Webhook retry authenticator code"]'), '123456');
    click(rendered.required<HTMLInputElement>('input[type="checkbox"]'));
    click(button(rendered.container, 'Confirm retry'));
    await vi.waitFor(() => expect(issueStepUp).toHaveBeenCalledTimes(1));
    click(button(rendered.container, 'Next'));
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('local_delivery2'));
    releaseStepUp({ proof: 'synthetic-proof', expiresAt: '2026-10-08T13:05:00.000Z' });
    await vi.waitFor(() => expect(client.getMutationCache().getAll()[0]?.state.status).toBe('error'));
    expect(retryVerifiedWebhook).not.toHaveBeenCalled();
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

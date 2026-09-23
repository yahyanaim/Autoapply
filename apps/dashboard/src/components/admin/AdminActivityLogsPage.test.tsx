import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView, setFormValue } from '@/test/render';
import { AdminActivityLogsPage } from './AdminActivityLogsPage';
import { AdminConsoleShell } from './AdminConsoleShell';

const { activityLogs } = vi.hoisted(() => ({ activityLogs: vi.fn() }));

vi.mock('@/lib/api/admin-api-client', () => ({
  adminApiClient: { adminConsole: { activityLogs } },
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/console/activity-logs' }));

const safeEvent = {
  id: 'audit-1',
  createdAt: '2026-09-22T09:00:00.000Z',
  action: 'admin.user.suspend',
  targetType: 'user',
  targetId: 'user-1',
  actorRef: 'actor_123',
  correlationId: 'request_123',
  before: { status: 'active' },
  after: { status: 'suspended' },
};

function view(node: ReactNode) {
  return renderView(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {node}
    </QueryClientProvider>,
  );
}

function buttonWithText(container: Element, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
  if (!button) throw new Error(`Expected button: ${text}`);
  return button;
}

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('AdminActivityLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    activityLogs.mockResolvedValue({ events: [safeEvent], limit: 20, nextCursor: 'next-cursor' });
  });

  it('renders only sanitized activity fields through the typed read client', async () => {
    const rendered = view(<AdminActivityLogsPage />);
    await settle();
    await settle();

    expect(rendered.container.textContent).toContain('admin · user · suspend');
    expect(rendered.container.textContent).toContain('actor_123');
    expect(rendered.container.textContent).not.toMatch(/metadata|192\.0\.2\.1|user-agent|proof|token|password|mfa|secret|resume|prompt|payment/i);
    expect(activityLogs).toHaveBeenCalledWith({ limit: 20 });
    expect(Object.keys((await import('@/lib/api/admin-api-client')).adminApiClient.adminConsole)).toEqual(['activityLogs']);
    rendered.cleanup();
  });

  it('sends approved filters, clears them, and never exposes the cursor', async () => {
    const rendered = view(<AdminActivityLogsPage />);
    await settle();
    setFormValue(rendered.required('input[aria-label="Filter by Action"]'), 'admin.user.suspend');
    await settle();
    await settle();
    setFormValue(rendered.required('input[aria-label="Filter by Actor user ID"]'), 'admin-1');
    await settle();
    await settle();
    setFormValue(rendered.required('input[aria-label="Filter by Target type"]'), 'user');
    await settle();
    await settle();
    setFormValue(rendered.required('input[aria-label="Filter by Target ID"]'), 'user-1');
    await settle();
    await settle();

    expect(activityLogs).toHaveBeenLastCalledWith(expect.objectContaining({
      limit: 20,
      action: 'admin.user.suspend',
      actorUserId: 'admin-1',
      targetType: 'user',
      targetId: 'user-1',
    }));
    expect(rendered.container.textContent).not.toContain('next-cursor');

    click(buttonWithText(rendered.container, 'Clear filters'));
    await settle();
    expect(rendered.required<HTMLInputElement>('input[aria-label="Filter by Action"]').value).toBe('');
    expect(rendered.required<HTMLInputElement>('input[aria-label="Filter by Actor user ID"]').value).toBe('');
    rendered.cleanup();
  });

  it('moves between cursor pages without rendering raw cursor values', async () => {
    activityLogs.mockImplementation(async (query: { cursor?: string }) => query.cursor
      ? { events: [{ ...safeEvent, id: 'audit-2', action: 'admin.session.revoke' }], limit: 20, nextCursor: null }
      : { events: [safeEvent], limit: 20, nextCursor: 'next-cursor' });
    const rendered = view(<AdminActivityLogsPage />);
    await settle();
    click(buttonWithText(rendered.container, 'Next'));
    await settle();
    await settle();

    expect(activityLogs).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next-cursor', limit: 20 }));
    expect(rendered.container.textContent).toContain('admin · session · revoke');
    expect(rendered.container.textContent).not.toContain('next-cursor');
    rendered.cleanup();
  });

  it('renders loading, empty, error retry, and feature-flag-disabled states', async () => {
    activityLogs.mockReturnValue(new Promise(() => undefined));
    const loading = view(<AdminActivityLogsPage />);
    expect(loading.required('[aria-label="Loading activity logs"]')).toBeTruthy();
    loading.cleanup();

    activityLogs.mockResolvedValueOnce({ events: [], limit: 20, nextCursor: null });
    const empty = view(<AdminActivityLogsPage />);
    await settle();
    await settle();
    expect(empty.container.textContent).toContain('No activity events found');
    empty.cleanup();

    activityLogs.mockRejectedValueOnce(new Error('safe failure')).mockResolvedValueOnce({ events: [safeEvent], limit: 20, nextCursor: null });
    const error = view(<AdminActivityLogsPage />);
    await settle();
    await settle();
    expect(error.container.textContent).toContain('Could not load activity logs');
    click(buttonWithText(error.container, 'Retry'));
    await settle();
    await settle();
    expect(error.container.textContent).toContain('admin · user · suspend');
    error.cleanup();

    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'false');
    const disabled = view(<AdminConsoleShell><p>Activity log child</p></AdminConsoleShell>);
    expect(disabled.container.textContent).toContain('Admin Console unavailable');
    expect(disabled.container.textContent).not.toContain('Activity log child');
    disabled.cleanup();
  });
});

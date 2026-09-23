import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView } from '@/test/render';
import { AdminOverviewPage } from './AdminOverviewPage';
import { AdminConsoleShell } from './AdminConsoleShell';

const { overview } = vi.hoisted(() => ({ overview: vi.fn() }));

vi.mock('@/lib/api/admin-api-client', () => ({
  adminApiClient: { adminConsole: { overview } },
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/console/overview' }));

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

describe('AdminOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    overview.mockResolvedValue({ suspendedUserCount: 4 });
  });

  it('renders the one safe suspended-user aggregate and no incident or sensitive data', async () => {
    const rendered = view(<AdminOverviewPage />);
    await settle();
    await settle();

    expect(rendered.container.textContent).toContain('Suspended users');
    expect(rendered.container.textContent).toContain('4');
    expect(rendered.container.textContent).not.toMatch(/active incidents|incident|email|session|token|hash|mfa|ip|user-agent|password|cv|resume|prompt|payment|metadata/i);
    expect(overview).toHaveBeenCalledTimes(1);
    expect(Object.keys((await import('@/lib/api/admin-api-client')).adminApiClient.adminConsole)).toEqual(['overview']);
    rendered.cleanup();
  });

  it('renders loading, zero, error retry, and disabled feature-flag states', async () => {
    overview.mockReturnValue(new Promise(() => undefined));
    const loading = view(<AdminOverviewPage />);
    expect(loading.required('[aria-label="Loading overview"]')).toBeTruthy();
    loading.cleanup();

    overview.mockResolvedValueOnce({ suspendedUserCount: 0 });
    const zero = view(<AdminOverviewPage />);
    await settle();
    await settle();
    expect(zero.container.textContent).toContain('No users are currently suspended.');
    expect(zero.container.textContent).not.toMatch(/incident/i);
    zero.cleanup();

    overview.mockRejectedValueOnce(new Error('safe failure')).mockResolvedValueOnce({ suspendedUserCount: 2 });
    const error = view(<AdminOverviewPage />);
    await settle();
    await settle();
    expect(error.container.textContent).toContain('Could not load overview');
    click(buttonWithText(error.container, 'Retry'));
    await settle();
    await settle();
    expect(error.container.textContent).toContain('2');
    error.cleanup();

    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'false');
    const disabled = view(<AdminConsoleShell><p>Overview child</p></AdminConsoleShell>);
    expect(disabled.container.textContent).toContain('Admin Console unavailable');
    expect(disabled.container.textContent).not.toContain('Overview child');
    disabled.cleanup();
  });
});

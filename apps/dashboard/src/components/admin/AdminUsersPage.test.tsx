import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { act } from 'react';
import { click, renderView, setFormValue } from '@/test/render';
import { AdminUsersPage } from './AdminUsersPage';
import { AdminUserDetailPage } from './AdminUserDetailPage';

const { users, user, userSessions, userUsageLimits, issueStepUp, grantUserQuota } = vi.hoisted(() => ({
  users: vi.fn(),
  user: vi.fn(),
  userSessions: vi.fn(),
  userUsageLimits: vi.fn(),
  issueStepUp: vi.fn(),
  grantUserQuota: vi.fn(),
}));

vi.mock('@/lib/api/admin-api-client', () => ({
  adminApiClient: { adminConsole: { users, user, userSessions, userUsageLimits, issueStepUp, grantUserQuota } },
}));
vi.mock('next/link', () => ({ default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));

const safeUser = { id: 'ckz8dc7m40000qwertyuiop12', email: 'safe@example.com', role: 'user' as const, status: 'active' as const, plan: 'free' as const, isEmailVerified: true, suspendedAt: null, createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z' };
function view(node: ReactNode) { return renderView(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>); }
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }

describe('Admin Console Users pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    users.mockResolvedValue({ users: [safeUser], limit: 20, nextCursor: 'next' });
    user.mockResolvedValue(safeUser);
    userSessions.mockResolvedValue({ sessions: [{ id: 'session-1', clientType: 'web', createdAt: safeUser.createdAt, lastUsedAt: safeUser.createdAt, expiresAt: '2026-10-01T00:00:00.000Z', current: false }], limit: 20, nextCursor: null });
    userUsageLimits.mockResolvedValue({ userId: safeUser.id, plan: 'free', period: 'monthly', resetAt: '2026-10-01T00:00:00.000Z', usage: { applications: { used: 1, limit: 10, remaining: 9, unlimited: false }, aiRequests: { used: 1, limit: 10, remaining: 9, unlimited: false }, resumeOptimizations: { used: 0, limit: 1, remaining: 1, unlimited: false }, jobDiscoveries: { used: 0, limit: 1, remaining: 1, unlimited: false }, resumes: { used: 0, limit: 1, remaining: 1, unlimited: false }, storageBytes: { used: 0, limit: 1, remaining: 1, unlimited: false } } });
    issueStepUp.mockResolvedValue({ proof: 'single-use-proof', expiresAt: '2026-10-01T12:05:00.000Z' });
    grantUserQuota.mockResolvedValue({ grantId: 'grant-1', targetUserId: safeUser.id, category: 'applications', amount: 5, expiresAt: '2026-10-31T23:59:00.000Z', status: 'active', createdAt: '2026-10-01T12:00:00.000Z', effectiveLimit: 15, remaining: 14 });
  });
  it('renders sanitized users and sends approved search/filter requests only', async () => {
    const rendered = view(<AdminUsersPage />); await settle(); await settle();
    expect(rendered.container.textContent).toContain('safe@example.com');
    expect(rendered.container.textContent).not.toMatch(/token|password|mfa|ip address/i);
    expect(safeUser).not.toHaveProperty('mfaEnabled');
    setFormValue(rendered.required('input[aria-label="Search users by email"]'), 'safe@example.com'); await settle();
    expect(users).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'safe@example.com', limit: 20 })); rendered.cleanup();
  });
  it('renders safe detail, sessions, and usage through only approved read methods', async () => {
    const rendered = view(<AdminUserDetailPage userId={safeUser.id} />);
    await vi.waitFor(() => {
      expect(rendered.container.textContent).toContain('Usage limits');
      expect(rendered.container.textContent).toContain('web');
      expect(rendered.container.textContent).toContain('1 / 10 · 9 remaining');
      expect(user).toHaveBeenCalledWith(safeUser.id);
      expect(userSessions).toHaveBeenCalledWith(safeUser.id, { limit: 20 });
      expect(userUsageLimits).toHaveBeenCalledWith(safeUser.id);
    });
    expect(rendered.container.textContent).not.toContain('session-1');
    rendered.cleanup();
  });
  it('issues a bound step-up proof and sends only the typed temporary grant payload', async () => {
    const rendered = view(<AdminUserDetailPage userId={safeUser.id} />);
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Temporary additive quota grant'));
    setFormValue(rendered.required('input[aria-label="Quota amount"]'), '5');
    setFormValue(rendered.required('input[aria-label="Quota UTC expiry"]'), '2026-10-31T23:59');
    setFormValue(rendered.required('input[aria-label="Quota grant authenticator code"]'), '123456');
    (rendered.required('input[aria-label="Confirm temporary quota grant"]') as HTMLInputElement).click();
    (rendered.required('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(issueStepUp).toHaveBeenCalledWith({
        code: '123456', action: 'admin.quota.grant', targetType: 'user', targetId: safeUser.id,
      });
      expect(grantUserQuota).toHaveBeenCalledWith(
        safeUser.id,
        expect.objectContaining({
          category: 'applications', amount: 5,
          expiresAt: '2026-10-31T23:59:00.000Z', reason: 'customer_support',
          stepUpProof: 'single-use-proof', idempotencyKey: expect.any(String),
        }),
      );
    });
    expect(rendered.container.textContent).not.toContain('single-use-proof');
    expect(rendered.container.textContent).not.toContain('quota-grant-request');
    rendered.cleanup();
  });
  it('shows the full safe grant intent and blocks submission until it is confirmed', async () => {
    const rendered = view(<AdminUserDetailPage userId={safeUser.id} />);
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Temporary additive quota grant'));
    setFormValue(rendered.required('input[aria-label="Quota amount"]'), '5');
    setFormValue(rendered.required('input[aria-label="Quota UTC expiry"]'), '2026-10-31T23:59');
    setFormValue(rendered.required('input[aria-label="Quota grant authenticator code"]'), '123456');
    const details = rendered.required('[aria-label="Quota grant confirmation details"]');
    expect(details.textContent).toContain(`Target: ${safeUser.email} (${safeUser.id})`);
    expect(details.textContent).toContain('Category: applications');
    expect(details.textContent).toContain('Amount: 5');
    expect(details.textContent).toContain('Expires: 2026-10-31 23:59 UTC');
    expect(details.textContent).toContain('Reason: customer support');
    expect((rendered.required('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    act(() => rendered.required('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(issueStepUp).not.toHaveBeenCalled();
    expect(grantUserQuota).not.toHaveBeenCalled();
    click(rendered.required('input[aria-label="Confirm temporary quota grant"]'));
    expect((rendered.required('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    rendered.cleanup();
  });
  it('invalidates confirmation after each semantic input or target change', async () => {
    const secondUserId = 'ckz8dc7m40000qwertyuiop13';
    user.mockImplementation((id: string) => Promise.resolve({ ...safeUser, id, email: id === safeUser.id ? safeUser.email : 'other@example.com' }));
    function SwitchableDetail() {
      const [id, setId] = useState(safeUser.id);
      return <><button type="button" onClick={() => setId(secondUserId)}>Switch target</button><AdminUserDetailPage userId={id} /></>;
    }
    const rendered = view(<SwitchableDetail />);
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Temporary additive quota grant'));
    setFormValue(rendered.required('input[aria-label="Quota amount"]'), '5');
    setFormValue(rendered.required('input[aria-label="Quota UTC expiry"]'), '2026-10-31T23:59');
    setFormValue(rendered.required('input[aria-label="Quota grant authenticator code"]'), '123456');
    const checkbox = () => rendered.required<HTMLInputElement>('input[aria-label="Confirm temporary quota grant"]');
    const assertReset = () => {
      expect(checkbox().checked).toBe(false);
      expect(rendered.required<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
    };
    const confirm = () => { click(checkbox()); expect(checkbox().checked).toBe(true); };
    confirm();
    setFormValue(rendered.required('input[aria-label="Quota amount"]'), '6'); assertReset();
    confirm();
    setFormValue(rendered.required('select[aria-label="Quota category"]'), 'ai_requests'); assertReset();
    confirm();
    setFormValue(rendered.required('input[aria-label="Quota UTC expiry"]'), '2026-11-01T12:00'); assertReset();
    confirm();
    setFormValue(rendered.required('select[aria-label="Quota grant reason"]'), 'service_recovery'); assertReset();
    confirm();
    click(rendered.required('button[type="button"]'));
    await vi.waitFor(() => expect(rendered.required('[aria-label="Quota grant confirmation details"]').textContent).toContain(secondUserId));
    assertReset();
    expect(grantUserQuota).not.toHaveBeenCalled();
    rendered.cleanup();
  });
  it('reuses the same idempotency key when an identical grant is retried after a request error', async () => {
    grantUserQuota.mockRejectedValueOnce(new Error('synthetic network failure'));
    const rendered = view(<AdminUserDetailPage userId={safeUser.id} />);
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Temporary additive quota grant'));
    setFormValue(rendered.required('input[aria-label="Quota amount"]'), '5');
    setFormValue(rendered.required('input[aria-label="Quota UTC expiry"]'), '2026-10-31T23:59');
    setFormValue(rendered.required('input[aria-label="Quota grant authenticator code"]'), '123456');
    (rendered.required('input[aria-label="Confirm temporary quota grant"]') as HTMLInputElement).click();
    const submit = () => (rendered.required('form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    submit();
    await vi.waitFor(() => expect(rendered.container.textContent).toContain('Quota grant failed'));
    const firstKey = grantUserQuota.mock.calls[0][1].idempotencyKey;
    submit();
    await vi.waitFor(() => expect(grantUserQuota).toHaveBeenCalledTimes(2));
    expect(grantUserQuota.mock.calls[1][1].idempotencyKey).toBe(firstKey);
    expect(issueStepUp).toHaveBeenCalledTimes(2);
    rendered.cleanup();
  });
});

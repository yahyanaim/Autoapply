import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { act } from 'react';
import { renderView, setFormValue } from '@/test/render';
import { AdminUsersPage } from './AdminUsersPage';
import { AdminUserDetailPage } from './AdminUserDetailPage';

const { users, user, userSessions, userUsageLimits } = vi.hoisted(() => ({
  users: vi.fn(),
  user: vi.fn(),
  userSessions: vi.fn(),
  userUsageLimits: vi.fn(),
}));

vi.mock('@/lib/api/admin-api-client', () => ({
  adminApiClient: { adminConsole: { users, user, userSessions, userUsageLimits } },
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
    const rendered = view(<AdminUserDetailPage userId={safeUser.id} />); await settle(); await settle();
    expect(rendered.container.textContent).toContain('Usage limits'); expect(rendered.container.textContent).toContain('web'); expect(rendered.container.textContent).not.toContain('session-1');
    expect(user).toHaveBeenCalledWith(safeUser.id); expect(userSessions).toHaveBeenCalledWith(safeUser.id, { limit: 20 }); expect(userUsageLimits).toHaveBeenCalledWith(safeUser.id);
    rendered.cleanup();
  });
});

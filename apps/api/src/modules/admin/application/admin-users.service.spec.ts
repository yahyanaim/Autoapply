import { NotFoundException } from '@nestjs/common';
import {
  SessionClientType,
  SubscriptionPlan,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { AdminUsersService } from './admin-users.service';
import { BillingUsageReadService } from '../../billing/application/billing-usage-read.service';

const context = {
  actorUserId: 'admin-1',
  sessionId: 'session-1',
  role: UserRole.platform_admin,
  mfaVerified: true,
  correlationId: 'request_12345678',
};

describe('AdminUsersService', () => {
  const transaction = { id: 'transaction-1' };
  const mutations = { execute: jest.fn() };
  const auth = {
    listAdminUsers: jest.fn(),
    getAdminUser: jest.fn(),
    listAdminUserSessions: jest.fn(),
    suspendUserInTransaction: jest.fn(),
    reactivateUserInTransaction: jest.fn(),
  };
  const billingUsage = { getUsageSummaryForAdmin: jest.fn() };
  let service: AdminUsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.listAdminUsers.mockResolvedValue([]);
    auth.getAdminUser.mockResolvedValue(null);
    auth.listAdminUserSessions.mockResolvedValue({ id: 'user-1', sessions: [] });
    billingUsage.getUsageSummaryForAdmin.mockResolvedValue({
      userId: 'user-1',
      plan: SubscriptionPlan.free,
      period: 'monthly',
      resetAt: new Date('2026-10-01T00:00:00.000Z'),
      usage: {
        applications: { used: 3, limit: 10, remaining: 7, unlimited: false },
        aiRequests: { used: 5, limit: 5, remaining: 0, unlimited: false },
        resumeOptimizations: { used: 0, limit: 1, remaining: 1, unlimited: false },
        jobDiscoveries: { used: 2, limit: 3, remaining: 1, unlimited: false },
        resumes: { used: 1, limit: 1, remaining: 0, unlimited: false },
        storageBytes: { used: 1024, limit: 5242880, remaining: 5241856, unlimited: false },
      },
    });
    auth.suspendUserInTransaction.mockResolvedValue({
      value: {
        userId: 'user-1',
        status: UserStatus.suspended,
        suspendedAt: new Date('2026-09-21T12:00:00.000Z'),
      },
      before: { status: UserStatus.active },
      after: {
        status: UserStatus.suspended,
        suspendedAt: new Date('2026-09-21T12:00:00.000Z'),
      },
    });
    auth.reactivateUserInTransaction.mockResolvedValue({
      value: { userId: 'user-1', status: UserStatus.active },
      before: { status: UserStatus.suspended },
      after: { status: UserStatus.active, suspendedAt: null },
    });
    mutations.execute.mockImplementation(async (input) => {
      const mutation = await input.command(transaction);
      return mutation.value;
    });
    service = new AdminUsersService(
      mutations as never,
      auth as never,
      billingUsage as unknown as BillingUsageReadService,
    );
  });

  it.each([SubscriptionPlan.free, SubscriptionPlan.pro, SubscriptionPlan.premium])(
    'delegates %s usage limits only to Billing and returns a strict allow-list',
    async (plan) => {
      billingUsage.getUsageSummaryForAdmin.mockResolvedValueOnce({
        userId: 'user-1',
        plan,
        period: 'monthly',
        resetAt: new Date('2026-10-01T00:00:00.000Z'),
        usage: {
          applications: { used: 12, limit: 10, remaining: 0, unlimited: false },
          aiRequests: { used: 25, limit: null, remaining: null, unlimited: true },
          resumeOptimizations: { used: 0, limit: 1, remaining: 1, unlimited: false },
          jobDiscoveries: { used: 2, limit: 3, remaining: 1, unlimited: false },
          resumes: { used: 1, limit: 1, remaining: 0, unlimited: false },
          storageBytes: { used: 1024, limit: 5242880, remaining: 5241856, unlimited: false },
        },
        payments: [{ card: 'must-not-leak' }],
        provider: 'must-not-leak',
      });

      const result = await service.usageLimits('user-1');

      expect(billingUsage.getUsageSummaryForAdmin).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expect.objectContaining({
        userId: 'user-1',
        plan,
        period: 'monthly',
        resetAt: '2026-10-01T00:00:00.000Z',
        usage: expect.objectContaining({
          applications: { used: 12, limit: 10, remaining: 0, unlimited: false },
          aiRequests: { used: 25, limit: null, remaining: null, unlimited: true },
        }),
      }));
      expect(JSON.stringify(result)).not.toMatch(/must-not-leak|payments|provider/);
      expect(mutations.execute).not.toHaveBeenCalled();
      expect(service).not.toHaveProperty('prisma');
    },
  );

  it('uses one owning-service query with normalized approved filters and a bounded page size', async () => {
    await service.list({
      limit: 1_000,
      search: '  USER@Example.COM  ',
      role: UserRole.user,
      status: UserStatus.active,
      plan: SubscriptionPlan.pro,
    });

    expect(auth.listAdminUsers).toHaveBeenCalledTimes(1);
    expect(auth.listAdminUsers).toHaveBeenCalledWith({
      limit: 100,
      search: 'user@example.com',
      role: UserRole.user,
      status: UserStatus.active,
      plan: SubscriptionPlan.pro,
    });
    expect(auth.getAdminUser).not.toHaveBeenCalled();
  });

  it('returns a stable cursor and strips fields outside the safe response contract', async () => {
    const first = {
      id: 'user-2',
      email: 'safe@example.com',
      role: UserRole.user,
      status: UserStatus.active,
      isEmailVerified: true,
      suspendedAt: null,
      createdAt: new Date('2026-09-21T00:00:00.000Z'),
      updatedAt: new Date('2026-09-21T01:00:00.000Z'),
      subscription: { plan: SubscriptionPlan.pro },
      passwordHash: 'must-not-leak',
    };
    auth.listAdminUsers.mockResolvedValue([first, { ...first, id: 'user-1' }]);

    const result = await service.list({ limit: 1 });

    expect(result.users).toEqual([
      {
        id: 'user-2',
        email: 'safe@example.com',
        role: UserRole.user,
        status: UserStatus.active,
        plan: SubscriptionPlan.pro,
        isEmailVerified: true,
        suspendedAt: null,
        createdAt: '2026-09-21T00:00:00.000Z',
        updatedAt: '2026-09-21T01:00:00.000Z',
      },
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));

    await service.list({ cursor: result.nextCursor!, limit: 1 });
    expect(auth.listAdminUsers).toHaveBeenLastCalledWith({
      limit: 1,
      cursor: {
        createdAt: new Date('2026-09-21T00:00:00.000Z'),
        id: 'user-2',
      },
    });
  });

  it('returns the existing safe not-found response for a missing detail', async () => {
    await expect(service.detail('missing-user')).rejects.toEqual(
      new NotFoundException('User not found'),
    );
    expect(auth.getAdminUser).toHaveBeenCalledTimes(1);
  });

  it('paginates and sanitizes sessions with one owning-service query', async () => {
    const first = {
      id: 'session-2',
      clientType: SessionClientType.web,
      createdAt: new Date('2026-09-21T02:00:00.000Z'),
      lastUsedAt: new Date('2026-09-21T02:05:00.000Z'),
      expiresAt: new Date('2026-09-28T02:00:00.000Z'),
      token: 'must-not-leak',
      ipAddress: '192.0.2.1',
      mfaVerifiedAt: new Date(),
    };
    auth.listAdminUserSessions.mockResolvedValue({
      id: 'user-1',
      sessions: [first, { ...first, id: 'session-1' }],
    });

    const result = await service.sessions({
      targetUserId: 'user-1',
      currentSessionId: 'session-2',
      limit: 1,
    });

    expect(auth.listAdminUserSessions).toHaveBeenCalledTimes(1);
    expect(result.sessions).toEqual([{
      id: 'session-2',
      clientType: SessionClientType.web,
      createdAt: '2026-09-21T02:00:00.000Z',
      lastUsedAt: '2026-09-21T02:05:00.000Z',
      expiresAt: '2026-09-28T02:00:00.000Z',
      current: true,
    }]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|192\.0\.2\.1|mfaVerifiedAt/);

    await service.sessions({
      targetUserId: 'user-1',
      cursor: result.nextCursor!,
      limit: 1,
    });
    expect(auth.listAdminUserSessions).toHaveBeenLastCalledWith({
      userId: 'user-1',
      limit: 1,
      cursor: {
        createdAt: new Date('2026-09-21T02:00:00.000Z'),
        id: 'session-2',
      },
    });
  });

  it('bounds session pages and safely rejects a missing target user', async () => {
    await service.sessions({ targetUserId: 'user-1', limit: 1_000 });
    expect(auth.listAdminUserSessions).toHaveBeenCalledWith({
      userId: 'user-1',
      limit: 100,
      cursor: undefined,
    });

    auth.listAdminUserSessions.mockResolvedValueOnce(null);
    await expect(
      service.sessions({ targetUserId: 'missing-user' }),
    ).rejects.toEqual(new NotFoundException('User not found'));
  });

  it('binds the proof and delegates suspension with the executor transaction', async () => {
    await expect(
      service.suspend({
        context,
        targetUserId: 'user-1',
        reason: 'policy violation',
        stepUpProof: 'a'.repeat(43),
      }),
    ).resolves.toEqual(expect.objectContaining({
      userId: 'user-1',
      status: UserStatus.suspended,
    }));

    expect(mutations.execute).toHaveBeenCalledWith(expect.objectContaining({
      context,
      proof: 'a'.repeat(43),
      action: 'admin.user.suspend',
      targetType: 'user',
      targetId: 'user-1',
      command: expect.any(Function),
    }));
    expect(auth.suspendUserInTransaction).toHaveBeenCalledWith(
      transaction,
      'admin-1',
      'user-1',
      'policy violation',
    );
  });

  it('propagates owning-domain policy failures without duplicating policy', async () => {
    const domainError = new Error('domain policy rejected suspension');
    auth.suspendUserInTransaction.mockRejectedValue(domainError);

    await expect(
      service.suspend({
        context,
        targetUserId: 'user-1',
        reason: 'policy violation',
        stepUpProof: 'a'.repeat(43),
      }),
    ).rejects.toBe(domainError);

    expect(auth.suspendUserInTransaction).toHaveBeenCalledTimes(1);
  });

  it('binds reactivation proof and delegates with the executor transaction', async () => {
    await expect(
      service.reactivateUser({
        context,
        targetUserId: 'user-1',
        stepUpProof: 'b'.repeat(43),
      }),
    ).resolves.toEqual({ userId: 'user-1', status: UserStatus.active });

    expect(mutations.execute).toHaveBeenCalledWith(expect.objectContaining({
      context,
      proof: 'b'.repeat(43),
      action: 'admin.user.reactivate',
      targetType: 'user',
      targetId: 'user-1',
      command: expect.any(Function),
    }));
    expect(auth.reactivateUserInTransaction).toHaveBeenCalledWith(
      transaction,
      'admin-1',
      'user-1',
    );
  });

  it('propagates reactivation policy failures through the executor', async () => {
    const domainError = new Error('User is not suspended');
    auth.reactivateUserInTransaction.mockRejectedValue(domainError);

    await expect(
      service.reactivateUser({
        context,
        targetUserId: 'user-1',
        stepUpProof: 'b'.repeat(43),
      }),
    ).rejects.toBe(domainError);

    expect(auth.reactivateUserInTransaction).toHaveBeenCalledTimes(1);
  });
});

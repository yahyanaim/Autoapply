import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  QuotaGrantCategory,
  QuotaGrantReason,
  SubscriptionPlan,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { BillingQuotaService, MAX_FINITE_QUOTA_LIMIT, QuotaGrantReplay } from './billing-quota.service';
import { PLAN_LIMITS } from '../domain/plan-limits';

const now = new Date('2026-10-01T12:00:00.000Z');
const expiresAt = new Date('2026-10-10T00:00:00.000Z');

function usage() {
  return {
    id: 'usage-1', userId: 'user-1', period: 'monthly', resetAt: new Date('2026-11-01T00:00:00.000Z'),
    applicationsUsed: 10, applicationsMax: 10,
    aiRequestsUsed: 2, aiRequestsMax: 5,
    resumeOptimizationsUsed: 0, resumeOptimizationsMax: 1,
    jobDiscoveriesUsed: 0, jobDiscoveriesMax: 3,
    resumesUsed: 1, resumesMax: 1,
    storageBytesUsed: 100, storageBytesMax: 5 * 1024 * 1024,
  };
}

describe('BillingQuotaService', () => {
  let prisma: any;
  let service: BillingQuotaService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      usageLimit: { findUnique: jest.fn(), updateMany: jest.fn() },
      quotaGrant: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 5 } }),
        groupBy: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: (transaction: any) => unknown) => callback(prisma)),
    };
    service = new BillingQuotaService(prisma);
    prisma.user.findUnique.mockResolvedValue({
      status: UserStatus.active,
      subscription: { plan: SubscriptionPlan.free, status: SubscriptionStatus.active },
      usageLimit: usage(),
    });
    prisma.usageLimit.findUnique.mockResolvedValue({ resetAt: usage().resetAt });
    prisma.usageLimit.updateMany.mockResolvedValue({ count: 1 });
  });

  it('adds active grants to the canonical bounded limit without changing used usage', async () => {
    await expect(
      service.effectiveQuotaInTransaction(prisma, 'user-1', QuotaGrantCategory.applications, now),
    ).resolves.toEqual({
      used: 10,
      planLimit: 10,
      grantAmount: 5,
      effectiveLimit: 15,
      remaining: 5,
      unlimited: false,
    });
    expect(prisma.quotaGrant.aggregate).toHaveBeenCalledWith({
      where: {
        targetUserId: 'user-1',
        category: QuotaGrantCategory.applications,
        expiresAt: { gt: now },
      },
      _sum: { amount: true },
    });
  });

  it('preserves effective unlimited semantics and never converts it to a number', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: UserStatus.active,
      subscription: { plan: SubscriptionPlan.premium, status: SubscriptionStatus.active },
      usageLimit: usage(),
    });
    const result = await service.effectiveQuotaInTransaction(
      prisma, 'user-1', QuotaGrantCategory.applications, now,
    );
    expect(result).toEqual(expect.objectContaining({ unlimited: true, effectiveLimit: null, remaining: null }));
    expect(prisma.quotaGrant.aggregate).not.toHaveBeenCalled();
  });

  it('reserves against the effective limit and preserves existing counters', async () => {
    await service.reserveInTransaction(
      prisma, 'user-1', QuotaGrantCategory.applications, 1, now, 'limit reached',
    );
    expect(prisma.usageLimit.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', applicationsUsed: { lte: 14 } },
      data: { applicationsUsed: { increment: 1 } },
    });
  });

  it.each([
    [QuotaGrantCategory.applications, 'applicationsUsed', 'applicationsMax'],
    [QuotaGrantCategory.ai_requests, 'aiRequestsUsed', 'aiRequestsMax'],
    [QuotaGrantCategory.resume_optimizations, 'resumeOptimizationsUsed', 'resumeOptimizationsMax'],
    [QuotaGrantCategory.job_discoveries, 'jobDiscoveriesUsed', 'jobDiscoveriesMax'],
    [QuotaGrantCategory.resumes, 'resumesUsed', 'resumesMax'],
    [QuotaGrantCategory.storage_bytes, 'storageBytesUsed', 'storageBytesMax'],
  ] as const)('uses active grants for %s through the shared owning quota calculation', async (category, usedField, maxField) => {
    const value = await service.effectiveQuotaInTransaction(prisma, 'user-1', category, now);
    expect(value).toEqual({
      used: usage()[usedField],
      planLimit: PLAN_LIMITS.free[maxField],
      grantAmount: 5,
      effectiveLimit: PLAN_LIMITS.free[maxField] + 5,
      remaining: Math.max(0, PLAN_LIMITS.free[maxField] + 5 - usage()[usedField]),
      unlimited: false,
    });
    expect(prisma.quotaGrant.aggregate).toHaveBeenCalledWith({
      where: { targetUserId: 'user-1', category, expiresAt: { gt: now } },
      _sum: { amount: true },
    });
  });

  it('saturates finite quota consistently after a plan upgrade and restores it after downgrade', async () => {
    const grants = 2_147_483_300;
    prisma.quotaGrant.aggregate.mockResolvedValue({ _sum: { amount: grants } });
    prisma.quotaGrant.groupBy.mockResolvedValue([{ category: QuotaGrantCategory.ai_requests, _sum: { amount: grants } }]);
    const setPlan = (plan: SubscriptionPlan) => prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', status: UserStatus.active,
      subscription: { plan, status: SubscriptionStatus.active }, usageLimit: usage(),
    });

    setPlan(SubscriptionPlan.free);
    expect((await service.effectiveQuotaInTransaction(prisma, 'user-1', QuotaGrantCategory.ai_requests, now)).effectiveLimit).toBe(2_147_483_305);
    setPlan(SubscriptionPlan.pro);
    const upgraded = await service.effectiveQuotaInTransaction(prisma, 'user-1', QuotaGrantCategory.ai_requests, now);
    const read = await service.getUsageSummaryForAdmin('user-1', now);
    expect(upgraded.effectiveLimit).toBe(MAX_FINITE_QUOTA_LIMIT);
    expect(upgraded.unlimited).toBe(false);
    expect(read.usage.aiRequests).toEqual({ used: upgraded.used, limit: upgraded.effectiveLimit, remaining: upgraded.remaining, unlimited: false });
    await service.reserveInTransaction(prisma, 'user-1', QuotaGrantCategory.ai_requests, 1, now, 'limit reached');
    expect(prisma.usageLimit.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', aiRequestsUsed: { lte: MAX_FINITE_QUOTA_LIMIT - 1 } },
      data: { aiRequestsUsed: { increment: 1 } },
    });

    setPlan(SubscriptionPlan.premium);
    expect((await service.getUsageSummaryForAdmin('user-1', now)).usage.aiRequests).toEqual({ used: 2, limit: null, remaining: null, unlimited: true });
    setPlan(SubscriptionPlan.free);
    expect((await service.getUsageSummaryForAdmin('user-1', now)).usage.aiRequests.limit).toBe(2_147_483_305);
  });

  it('creates one sanitized future grant with hashed idempotency identity', async () => {
    prisma.quotaGrant.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.quotaGrant.create.mockResolvedValue({
      id: 'grant-1', targetUserId: 'user-1', category: QuotaGrantCategory.applications,
      amount: 5, expiresAt, reason: QuotaGrantReason.customer_support, createdAt: now,
      effectiveLimitAtCreation: 15, remainingAtCreation: 5,
    });
    const result = await service.grantInTransaction(prisma, {
      targetUserId: 'user-1', actorUserId: 'admin-1', category: QuotaGrantCategory.applications,
      amount: 5, expiresAt, reason: QuotaGrantReason.customer_support,
      idempotencyKey: 'quota-request-0001', now,
    });
    expect(result.value).toEqual({
      grantId: 'grant-1', targetUserId: 'user-1', category: QuotaGrantCategory.applications,
      amount: 5, expiresAt, status: 'active', createdAt: now, effectiveLimit: 15, remaining: 5,
    });
    expect(prisma.quotaGrant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
    expect(JSON.stringify(result)).not.toMatch(/quota-request|password|token|proof|email/i);
  });

  it('persists the same saturated finite limit returned to the administrator', async () => {
    prisma.quotaGrant.aggregate.mockResolvedValue({ _sum: { amount: 2_147_483_300 } });
    prisma.quotaGrant.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'grant-saturated', targetUserId: 'user-1', category: QuotaGrantCategory.ai_requests,
      amount: 341, expiresAt, reason: QuotaGrantReason.customer_support, createdAt: now,
      effectiveLimitAtCreation: data.effectiveLimitAtCreation,
      remainingAtCreation: data.remainingAtCreation,
    }));
    const result = await service.grantInTransaction(prisma, {
      targetUserId: 'user-1', actorUserId: 'admin-1', category: QuotaGrantCategory.ai_requests,
      amount: 341, expiresAt, reason: QuotaGrantReason.customer_support,
      idempotencyKey: 'quota-request-saturated', now,
    });
    expect(result.value).toEqual(expect.objectContaining({
      effectiveLimit: MAX_FINITE_QUOTA_LIMIT,
      remaining: MAX_FINITE_QUOTA_LIMIT - 2,
    }));
    expect(prisma.quotaGrant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        effectiveLimitAtCreation: MAX_FINITE_QUOTA_LIMIT,
        remainingAtCreation: MAX_FINITE_QUOTA_LIMIT - 2,
      }),
    }));
  });

  it('fails closed for self-targets, suspended users, missing users, and unlimited categories', async () => {
    const base = {
      targetUserId: 'user-1', actorUserId: 'admin-1', category: QuotaGrantCategory.applications,
      amount: 1, expiresAt, reason: QuotaGrantReason.customer_support,
      idempotencyKey: 'quota-request-0001', now,
    };
    await expect(service.grantInTransaction(prisma, { ...base, actorUserId: 'user-1' })).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.grantInTransaction(prisma, base)).rejects.toBeInstanceOf(NotFoundException);
    prisma.user.findUnique.mockResolvedValueOnce({ status: UserStatus.suspended, subscription: { plan: SubscriptionPlan.free, status: SubscriptionStatus.active }, usageLimit: { id: 'usage-1' } });
    await expect(service.grantInTransaction(prisma, base)).rejects.toBeInstanceOf(ConflictException);
    prisma.user.findUnique.mockResolvedValueOnce({ status: UserStatus.active, subscription: { plan: SubscriptionPlan.premium, status: SubscriptionStatus.active }, usageLimit: { id: 'usage-1' } });
    await expect(service.grantInTransaction(prisma, base)).rejects.toThrow('already unlimited');
  });

  it('rejects expired grants and same-key/different-input while replaying identical input', async () => {
    const base = {
      targetUserId: 'user-1', actorUserId: 'admin-1', category: QuotaGrantCategory.applications,
      amount: 1, expiresAt, reason: QuotaGrantReason.customer_support,
      idempotencyKey: 'quota-request-0001', now,
    };
    await expect(service.grantInTransaction(prisma, { ...base, expiresAt: now })).rejects.toBeInstanceOf(ConflictException);
    prisma.quotaGrant.findUnique.mockResolvedValueOnce({ requestFingerprint: 'different' });
    await expect(service.grantInTransaction(prisma, base)).rejects.toBeInstanceOf(ConflictException);

    const fingerprint = (service as any).hash(JSON.stringify({
      targetUserId: base.targetUserId, category: base.category, amount: base.amount,
      expiresAt: base.expiresAt.toISOString(), reason: base.reason,
    }));
    prisma.quotaGrant.findUnique.mockResolvedValueOnce({ requestFingerprint: fingerprint });
    await expect(service.grantInTransaction(prisma, base)).rejects.toBeInstanceOf(QuotaGrantReplay);
    prisma.quotaGrant.findUnique.mockResolvedValueOnce({ requestFingerprint: fingerprint });
    await expect(service.grantInTransaction(prisma, {
      ...base,
      now: new Date('2026-10-11T00:00:00.000Z'),
    })).rejects.toBeInstanceOf(QuotaGrantReplay);
  });

  it('replays one durable grant with current active or expired status and current effective quota', async () => {
    const input = {
      targetUserId: 'user-1', actorUserId: 'admin-1', category: QuotaGrantCategory.applications,
      amount: 5, expiresAt, reason: QuotaGrantReason.customer_support,
      idempotencyKey: 'quota-request-0001', now,
    };
    const fingerprint = (service as any).hash(JSON.stringify({
      targetUserId: input.targetUserId, category: input.category, amount: input.amount,
      expiresAt: input.expiresAt.toISOString(), reason: input.reason,
    }));
    prisma.quotaGrant.findUnique.mockResolvedValue({
      id: 'grant-1', targetUserId: input.targetUserId, category: input.category,
      amount: input.amount, expiresAt, createdAt: now, requestFingerprint: fingerprint,
    });
    const active = await service.resolveIdempotentResult(input, now);
    expect(active).toEqual(expect.objectContaining({ grantId: 'grant-1', status: 'active', effectiveLimit: 15, remaining: 5 }));
    prisma.quotaGrant.aggregate.mockResolvedValue({ _sum: { amount: null } });
    const expired = await service.resolveIdempotentResult(input, expiresAt);
    expect(expired).toEqual(expect.objectContaining({ grantId: 'grant-1', status: 'expired', effectiveLimit: 10, remaining: 0 }));
    expect(prisma.quotaGrant.create).not.toHaveBeenCalled();
    await expect(service.resolveIdempotentResult({ ...input, amount: 6 }, now)).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps period rollover bounded to the four existing monthly counters', async () => {
    await service.resetPeriodicUsageInTransaction(prisma, 'user-1', now);
    expect(prisma.usageLimit.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', resetAt: { lt: now } },
      data: {
        applicationsUsed: 0,
        aiRequestsUsed: 0,
        resumeOptimizationsUsed: 0,
        jobDiscoveriesUsed: 0,
        resetAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    });
  });
});

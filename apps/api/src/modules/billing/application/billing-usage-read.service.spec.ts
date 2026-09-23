import { NotFoundException } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UNLIMITED_PLAN_LIMIT } from '../domain/plan-limits';
import { BillingUsageReadService } from './billing-usage-read.service';

const resetAt = new Date('2026-10-01T00:00:00.000Z');

function usageLimit(overrides: Record<string, unknown> = {}) {
  return {
    period: 'monthly',
    resetAt,
    applicationsUsed: 3,
    applicationsMax: 10,
    aiRequestsUsed: 5,
    aiRequestsMax: 5,
    resumeOptimizationsUsed: 0,
    resumeOptimizationsMax: 1,
    jobDiscoveriesUsed: 2,
    jobDiscoveriesMax: 3,
    resumesUsed: 1,
    resumesMax: 1,
    storageBytesUsed: 1024,
    storageBytesMax: 5 * 1024 * 1024,
    ...overrides,
  };
}

function user(
  plan: SubscriptionPlan = SubscriptionPlan.free,
  status: SubscriptionStatus = SubscriptionStatus.active,
  usage = usageLimit(),
) {
  return {
    id: 'user-1',
    subscription: { plan, status },
    usageLimit: usage,
  };
}

describe('BillingUsageReadService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    usageLimit: {
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    payment: { findMany: jest.fn() },
    aIRequest: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: BillingUsageReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingUsageReadService(prisma as unknown as PrismaService);
  });

  it('returns the complete finite Free-plan operational snapshot', async () => {
    prisma.user.findUnique.mockResolvedValue(user());

    await expect(service.getUsageSummaryForAdmin('user-1')).resolves.toEqual({
      userId: 'user-1',
      plan: SubscriptionPlan.free,
      period: 'monthly',
      resetAt,
      usage: {
        applications: { used: 3, limit: 10, remaining: 7, unlimited: false },
        aiRequests: { used: 5, limit: 5, remaining: 0, unlimited: false },
        resumeOptimizations: { used: 0, limit: 1, remaining: 1, unlimited: false },
        jobDiscoveries: { used: 2, limit: 3, remaining: 1, unlimited: false },
        resumes: { used: 1, limit: 1, remaining: 0, unlimited: false },
        storageBytes: {
          used: 1024,
          limit: 5 * 1024 * 1024,
          remaining: 5 * 1024 * 1024 - 1024,
          unlimited: false,
        },
      },
    });
  });

  it.each([
    [SubscriptionPlan.pro, SubscriptionStatus.active],
    [SubscriptionPlan.pro, SubscriptionStatus.trialing],
    [SubscriptionPlan.premium, SubscriptionStatus.past_due],
  ])('preserves trusted paid entitlement %s/%s', async (plan, status) => {
    prisma.user.findUnique.mockResolvedValue(user(plan, status));

    await expect(service.getUsageSummaryForAdmin('user-1')).resolves.toEqual(
      expect.objectContaining({ plan }),
    );
  });

  it.each([
    SubscriptionStatus.canceled,
    SubscriptionStatus.incomplete,
    SubscriptionStatus.incomplete_expired,
    SubscriptionStatus.unpaid,
    SubscriptionStatus.paused,
  ])('falls back to Free for inactive %s paid subscriptions', async (status) => {
    prisma.user.findUnique.mockResolvedValue(
      user(SubscriptionPlan.pro, status),
    );

    await expect(service.getUsageSummaryForAdmin('user-1')).resolves.toEqual(
      expect.objectContaining({ plan: SubscriptionPlan.free }),
    );
  });

  it('maps the canonical unlimited sentinel and clamps finite remaining at zero', async () => {
    prisma.user.findUnique.mockResolvedValue(
      user(
        SubscriptionPlan.premium,
        SubscriptionStatus.active,
        usageLimit({
          applicationsUsed: 12,
          applicationsMax: 10,
          aiRequestsUsed: 25,
          aiRequestsMax: UNLIMITED_PLAN_LIMIT,
        }),
      ),
    );

    const summary = await service.getUsageSummaryForAdmin('user-1');

    expect(summary.usage.applications).toEqual({
      used: 12,
      limit: 10,
      remaining: 0,
      unlimited: false,
    });
    expect(summary.usage.aiRequests).toEqual({
      used: 25,
      limit: null,
      remaining: null,
      unlimited: true,
    });
  });

  it.each([
    [null, 'User not found'],
    [{ id: 'user-1', subscription: null, usageLimit: usageLimit() }, 'Subscription not found for user'],
    [{ id: 'user-1', subscription: { plan: SubscriptionPlan.free, status: SubscriptionStatus.active }, usageLimit: null }, 'Usage limit not found for user'],
  ])('uses safe not-found errors for incomplete ownership records', async (record, message) => {
    prisma.user.findUnique.mockResolvedValue(record);

    await expect(service.getUsageSummaryForAdmin('user-1')).rejects.toEqual(
      new NotFoundException(message),
    );
  });

  it('uses exactly one strict read projection and makes no quota or history calls', async () => {
    prisma.user.findUnique.mockResolvedValue(user());

    const result = await service.getUsageSummaryForAdmin('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        subscription: { select: { plan: true, status: true } },
        usageLimit: {
          select: {
            period: true,
            resetAt: true,
            applicationsUsed: true,
            applicationsMax: true,
            aiRequestsUsed: true,
            aiRequestsMax: true,
            resumeOptimizationsUsed: true,
            resumeOptimizationsMax: true,
            jobDiscoveriesUsed: true,
            jobDiscoveriesMax: true,
            resumesUsed: true,
            resumesMax: true,
            storageBytesUsed: true,
            storageBytesMax: true,
          },
        },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.usageLimit.findUnique).not.toHaveBeenCalled();
    expect(prisma.usageLimit.update).not.toHaveBeenCalled();
    expect(prisma.usageLimit.updateMany).not.toHaveBeenCalled();
    expect(prisma.usageLimit.upsert).not.toHaveBeenCalled();
    expect(prisma.usageLimit.delete).not.toHaveBeenCalled();
    expect(prisma.usageLimit.deleteMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.aIRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /password|token|hash|mfa|ipAddress|userAgent|cookie|authorization|payment|prompt|resumeContent|provider|secret/i,
    );
  });
});

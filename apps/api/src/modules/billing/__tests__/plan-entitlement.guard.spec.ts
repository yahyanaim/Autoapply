import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { PlanEntitlementGuard } from '../interface/guards/plan-entitlement.guard';

describe('PlanEntitlementGuard', () => {
  const requirement = {
    minimumPlan: SubscriptionPlan.pro,
    feature: 'Resume optimization',
  };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requirement),
  };
  const prisma = {
    subscription: { findUnique: jest.fn() },
  };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'user_1' } }),
    }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(requirement);
  });

  it('allows an active Pro subscription', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.pro,
      status: SubscriptionStatus.active,
    });
    const guard = new PlanEntitlementGuard(
      reflector as unknown as Reflector,
      prisma as never,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows Premium to use a Pro feature', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.premium,
      status: SubscriptionStatus.trialing,
    });
    const guard = new PlanEntitlementGuard(
      reflector as unknown as Reflector,
      prisma as never,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a Free user with a machine-readable upgrade response', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.free,
      status: SubscriptionStatus.active,
    });
    const guard = new PlanEntitlementGuard(
      reflector as unknown as Reflector,
      prisma as never,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('treats a canceled paid subscription as Free', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.pro,
      status: SubscriptionStatus.canceled,
    });
    const guard = new PlanEntitlementGuard(
      reflector as unknown as Reflector,
      prisma as never,
    );

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});

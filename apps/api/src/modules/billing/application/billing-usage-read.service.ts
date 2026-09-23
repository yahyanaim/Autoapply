import { Injectable, NotFoundException } from '@nestjs/common';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UNLIMITED_PLAN_LIMIT } from '../domain/plan-limits';

const PAID_ENTITLEMENT_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.active,
  SubscriptionStatus.trialing,
  SubscriptionStatus.past_due,
]);

export interface BillingUsageCategorySummary {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
}

export interface BillingUsageSummary {
  userId: string;
  plan: SubscriptionPlan;
  period: string;
  resetAt: Date;
  usage: {
    applications: BillingUsageCategorySummary;
    aiRequests: BillingUsageCategorySummary;
    resumeOptimizations: BillingUsageCategorySummary;
    jobDiscoveries: BillingUsageCategorySummary;
    resumes: BillingUsageCategorySummary;
    storageBytes: BillingUsageCategorySummary;
  };
}

@Injectable()
export class BillingUsageReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsageSummaryForAdmin(userId: string): Promise<BillingUsageSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscription: {
          select: { plan: true, status: true },
        },
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
    if (!user) throw new NotFoundException('User not found');
    if (!user.subscription) {
      throw new NotFoundException('Subscription not found for user');
    }
    if (!user.usageLimit) {
      throw new NotFoundException('Usage limit not found for user');
    }

    const usage = user.usageLimit;
    return {
      userId: user.id,
      plan: this.effectivePlan(user.subscription),
      period: usage.period,
      resetAt: usage.resetAt,
      usage: {
        applications: this.category(
          usage.applicationsUsed,
          usage.applicationsMax,
        ),
        aiRequests: this.category(usage.aiRequestsUsed, usage.aiRequestsMax),
        resumeOptimizations: this.category(
          usage.resumeOptimizationsUsed,
          usage.resumeOptimizationsMax,
        ),
        jobDiscoveries: this.category(
          usage.jobDiscoveriesUsed,
          usage.jobDiscoveriesMax,
        ),
        resumes: this.category(usage.resumesUsed, usage.resumesMax),
        storageBytes: this.category(
          usage.storageBytesUsed,
          usage.storageBytesMax,
        ),
      },
    };
  }

  private effectivePlan(subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
  }): SubscriptionPlan {
    if (subscription.plan === SubscriptionPlan.free) {
      return SubscriptionPlan.free;
    }
    return PAID_ENTITLEMENT_STATUSES.has(subscription.status)
      ? subscription.plan
      : SubscriptionPlan.free;
  }

  private category(used: number, limit: number): BillingUsageCategorySummary {
    if (limit >= UNLIMITED_PLAN_LIMIT) {
      return { used, limit: null, remaining: null, unlimited: true };
    }
    return {
      used,
      limit,
      remaining: Math.max(limit - used, 0),
      unlimited: false,
    };
  }
}

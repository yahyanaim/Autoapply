import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuotaGrantCategory,
  QuotaGrantReason,
  SubscriptionPlan,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PLAN_LIMITS, UNLIMITED_PLAN_LIMIT } from '../domain/plan-limits';

const PAID_ENTITLEMENT_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.active,
  SubscriptionStatus.trialing,
  SubscriptionStatus.past_due,
]);

// The sentinel represents an unlimited plan, never the result of additive grants.
export const MAX_FINITE_QUOTA_LIMIT = UNLIMITED_PLAN_LIMIT - 1;

const CATEGORY_FIELDS: Record<
  QuotaGrantCategory,
  { used: keyof Prisma.UsageLimitSelect; max: keyof typeof PLAN_LIMITS.free; periodic: boolean }
> = {
  [QuotaGrantCategory.applications]: {
    used: 'applicationsUsed', max: 'applicationsMax', periodic: true,
  },
  [QuotaGrantCategory.ai_requests]: {
    used: 'aiRequestsUsed', max: 'aiRequestsMax', periodic: true,
  },
  [QuotaGrantCategory.resume_optimizations]: {
    used: 'resumeOptimizationsUsed', max: 'resumeOptimizationsMax', periodic: true,
  },
  [QuotaGrantCategory.job_discoveries]: {
    used: 'jobDiscoveriesUsed', max: 'jobDiscoveriesMax', periodic: true,
  },
  [QuotaGrantCategory.resumes]: {
    used: 'resumesUsed', max: 'resumesMax', periodic: false,
  },
  [QuotaGrantCategory.storage_bytes]: {
    used: 'storageBytesUsed', max: 'storageBytesMax', periodic: false,
  },
};

export interface BillingQuotaValue {
  used: number;
  planLimit: number;
  grantAmount: number;
  effectiveLimit: number | null;
  remaining: number | null;
  unlimited: boolean;
}

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
  usage: Record<'applications' | 'aiRequests' | 'resumeOptimizations' | 'jobDiscoveries' | 'resumes' | 'storageBytes', BillingUsageCategorySummary>;
}

export interface GrantQuotaInput {
  targetUserId: string;
  actorUserId: string;
  category: QuotaGrantCategory;
  amount: number;
  expiresAt: Date;
  reason: QuotaGrantReason;
  idempotencyKey: string;
  now: Date;
}

export class QuotaGrantReplay extends Error {}
export class QuotaGrantPersistenceConflict extends Error {}

@Injectable()
export class BillingQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  effectivePlan(subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
  }): SubscriptionPlan {
    if (subscription.plan === SubscriptionPlan.free) return SubscriptionPlan.free;
    return PAID_ENTITLEMENT_STATUSES.has(subscription.status)
      ? subscription.plan
      : SubscriptionPlan.free;
  }

  async getUsageSummaryForAdmin(userId: string, now = new Date()): Promise<BillingUsageSummary> {
    const [user, totals] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          subscription: { select: { plan: true, status: true } },
          usageLimit: true,
        },
      }),
      this.prisma.quotaGrant.groupBy({
        by: ['category'],
        where: { targetUserId: userId, expiresAt: { gt: now } },
        _sum: { amount: true },
      }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!user.subscription) throw new NotFoundException('Subscription not found for user');
    if (!user.usageLimit) throw new NotFoundException('Usage limit not found for user');
    const plan = this.effectivePlan(user.subscription);
    const periodRolledOver = user.usageLimit.resetAt < now;
    const grantTotals = new Map(totals.map((entry) => [entry.category, entry._sum.amount ?? 0]));
    const value = (category: QuotaGrantCategory): BillingUsageCategorySummary => {
      const fields = CATEGORY_FIELDS[category];
      const used = periodRolledOver && fields.periodic
        ? 0
        : user.usageLimit![fields.used as keyof typeof user.usageLimit] as number;
      const planLimit = PLAN_LIMITS[plan][fields.max];
      const quota = this.calculateEffectiveQuota(used, planLimit, grantTotals.get(category) ?? 0);
      return { used: quota.used, limit: quota.effectiveLimit, remaining: quota.remaining, unlimited: quota.unlimited };
    };
    return {
      userId: user.id,
      plan,
      period: user.usageLimit.period,
      resetAt: periodRolledOver ? this.nextMonthlyReset(now) : user.usageLimit.resetAt,
      usage: {
        applications: value(QuotaGrantCategory.applications),
        aiRequests: value(QuotaGrantCategory.ai_requests),
        resumeOptimizations: value(QuotaGrantCategory.resume_optimizations),
        jobDiscoveries: value(QuotaGrantCategory.job_discoveries),
        resumes: value(QuotaGrantCategory.resumes),
        storageBytes: value(QuotaGrantCategory.storage_bytes),
      },
    };
  }

  async activeGrantAmount(
    transaction: Prisma.TransactionClient,
    userId: string,
    category: QuotaGrantCategory,
    now: Date,
  ): Promise<number> {
    const aggregate = await transaction.quotaGrant.aggregate({
      where: { targetUserId: userId, category, expiresAt: { gt: now } },
      _sum: { amount: true },
    });
    return aggregate._sum.amount ?? 0;
  }

  async effectiveQuotaInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    category: QuotaGrantCategory,
    now: Date,
  ): Promise<BillingQuotaValue> {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: {
        subscription: { select: { plan: true, status: true } },
        usageLimit: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.subscription) throw new NotFoundException('Subscription not found for user');
    if (!user.usageLimit) throw new NotFoundException('Usage limit not found for user');
    const plan = this.effectivePlan(user.subscription);
    const fields = CATEGORY_FIELDS[category];
    const planLimit = PLAN_LIMITS[plan][fields.max];
    const used = user.usageLimit[fields.used as keyof typeof user.usageLimit] as number;
    const grantAmount = planLimit >= UNLIMITED_PLAN_LIMIT
      ? 0
      : await this.activeGrantAmount(transaction, userId, category, now);
    return this.calculateEffectiveQuota(used, planLimit, grantAmount);
  }

  async resetPeriodicUsageInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<void> {
    await transaction.usageLimit.updateMany({
      where: { userId, resetAt: { lt: now } },
      data: {
        applicationsUsed: 0,
        aiRequestsUsed: 0,
        resumeOptimizationsUsed: 0,
        jobDiscoveriesUsed: 0,
        resetAt: this.nextMonthlyReset(now),
      },
    });
  }

  async reserveInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    category: QuotaGrantCategory,
    amount: number,
    now: Date,
    limitMessage: string,
  ): Promise<{ resetAt: Date; quota: BillingQuotaValue }> {
    const fields = CATEGORY_FIELDS[category];
    if (fields.periodic) {
      await this.resetPeriodicUsageInTransaction(transaction, userId, now);
    }
    const quota = await this.effectiveQuotaInTransaction(transaction, userId, category, now);
    if (!quota.unlimited && (quota.remaining ?? 0) < amount) {
      throw new ForbiddenException(limitMessage);
    }
    const usage = await transaction.usageLimit.findUnique({
      where: { userId }, select: { resetAt: true },
    });
    if (!usage) throw new NotFoundException('Usage limit not found for user');
    const where: Prisma.UsageLimitWhereInput = { userId };
    if (!quota.unlimited) {
      (where as Record<string, unknown>)[fields.used] = {
        lte: (quota.effectiveLimit as number) - amount,
      };
    }
    const data = {
      [fields.used]: { increment: amount },
    } as Prisma.UsageLimitUpdateManyMutationInput;
    const reserved = await transaction.usageLimit.updateMany({ where, data });
    if (reserved.count !== 1) throw new ForbiddenException(limitMessage);
    return { resetAt: usage.resetAt, quota: { ...quota, used: quota.used + amount, remaining: quota.unlimited ? null : Math.max(0, (quota.effectiveLimit as number) - quota.used - amount) } };
  }

  async reserve(
    userId: string,
    category: QuotaGrantCategory,
    amount: number,
    now: Date,
    limitMessage: string,
  ) {
    return this.prisma.$transaction((transaction) =>
      this.reserveInTransaction(transaction, userId, category, amount, now, limitMessage),
    );
  }

  async currentQuota(
    userId: string,
    category: QuotaGrantCategory,
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      if (CATEGORY_FIELDS[category].periodic) {
        await this.resetPeriodicUsageInTransaction(transaction, userId, now);
      }
      const quota = await this.effectiveQuotaInTransaction(transaction, userId, category, now);
      const usage = await transaction.usageLimit.findUnique({ where: { userId }, select: { resetAt: true } });
      if (!usage) throw new NotFoundException('Usage limit not found for user');
      return { ...quota, resetAt: usage.resetAt };
    });
  }

  async reserveResumeStorageInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    storageBytes: number,
    now: Date,
  ): Promise<void> {
    const [resumes, storage] = await Promise.all([
      this.effectiveQuotaInTransaction(transaction, userId, QuotaGrantCategory.resumes, now),
      this.effectiveQuotaInTransaction(transaction, userId, QuotaGrantCategory.storage_bytes, now),
    ]);
    if ((!resumes.unlimited && (resumes.remaining ?? 0) < 1) ||
        (!storage.unlimited && (storage.remaining ?? 0) < storageBytes)) {
      throw new ForbiddenException('Resume storage limit reached for this plan');
    }
    const where: Prisma.UsageLimitWhereInput = { userId };
    if (!resumes.unlimited) where.resumesUsed = { lte: (resumes.effectiveLimit as number) - 1 };
    if (!storage.unlimited) where.storageBytesUsed = { lte: (storage.effectiveLimit as number) - storageBytes };
    const reserved = await transaction.usageLimit.updateMany({
      where,
      data: {
        resumesUsed: { increment: 1 },
        storageBytesUsed: { increment: storageBytes },
      },
    });
    if (reserved.count !== 1) {
      throw new ForbiddenException('Resume storage limit reached for this plan');
    }
  }

  async releaseInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    category: QuotaGrantCategory,
    amount: number,
    resetAt?: Date,
  ): Promise<void> {
    const fields = CATEGORY_FIELDS[category];
    const where: Prisma.UsageLimitWhereInput = { userId };
    if (resetAt) where.resetAt = resetAt;
    (where as Record<string, unknown>)[fields.used] = { gte: amount };
    await transaction.usageLimit.updateMany({
      where,
      data: { [fields.used]: { decrement: amount } } as Prisma.UsageLimitUpdateManyMutationInput,
    });
  }

  async release(
    userId: string,
    category: QuotaGrantCategory,
    amount: number,
    resetAt?: Date,
  ): Promise<void> {
    await this.prisma.$transaction((transaction) =>
      this.releaseInTransaction(transaction, userId, category, amount, resetAt),
    );
  }

  async grantInTransaction(
    transaction: Prisma.TransactionClient,
    input: GrantQuotaInput,
  ) {
    if (input.actorUserId === input.targetUserId) {
      throw new ForbiddenException('Administrators cannot grant quota to themselves');
    }
    const idempotencyKeyHash = this.hash(`${input.actorUserId}:${input.idempotencyKey}`);
    const requestFingerprint = this.hash(JSON.stringify({
      targetUserId: input.targetUserId,
      category: input.category,
      amount: input.amount,
      expiresAt: input.expiresAt.toISOString(),
      reason: input.reason,
    }));
    const existing = await transaction.quotaGrant.findUnique({
      where: { grantedByUserId_idempotencyKeyHash: { grantedByUserId: input.actorUserId, idempotencyKeyHash } },
      select: { requestFingerprint: true },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new ConflictException('Idempotency key is already used for another request');
      }
      throw new QuotaGrantReplay();
    }
    if (input.expiresAt.getTime() <= input.now.getTime()) {
      throw new ConflictException('Quota grant expiration must be in the future');
    }
    const target = await transaction.user.findUnique({
      where: { id: input.targetUserId },
      select: { status: true, subscription: { select: { plan: true, status: true } }, usageLimit: { select: { id: true } } },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.status !== UserStatus.active) throw new ConflictException('Quota can only be granted to an active user');
    if (!target.subscription) throw new NotFoundException('Subscription not found for user');
    if (!target.usageLimit) throw new NotFoundException('Usage limit not found for user');
    const plan = this.effectivePlan(target.subscription);
    const fields = CATEGORY_FIELDS[input.category];
    if (PLAN_LIMITS[plan][fields.max] >= UNLIMITED_PLAN_LIMIT) {
      throw new ConflictException('Quota category is already unlimited');
    }
    const before = await this.effectiveQuotaInTransaction(transaction, input.targetUserId, input.category, input.now);
    if (input.amount > MAX_FINITE_QUOTA_LIMIT - (before.effectiveLimit as number)) {
      throw new ConflictException('Quota grant exceeds the supported bounded limit');
    }
    const after = this.calculateEffectiveQuota(before.used, before.planLimit, before.grantAmount, input.amount);
    try {
      const grant = await transaction.quotaGrant.create({
        data: {
          targetUserId: input.targetUserId,
          category: input.category,
          amount: input.amount,
          expiresAt: input.expiresAt,
          reason: input.reason,
          grantedByUserId: input.actorUserId,
          idempotencyKeyHash,
          requestFingerprint,
          effectiveLimitAtCreation: after.effectiveLimit as number,
          remainingAtCreation: after.remaining as number,
        },
        select: { id: true, targetUserId: true, category: true, amount: true, expiresAt: true, createdAt: true },
      });
      return {
        value: {
          grantId: grant.id,
          targetUserId: grant.targetUserId,
          category: grant.category,
          amount: grant.amount,
          expiresAt: grant.expiresAt,
          status: 'active' as const,
          createdAt: grant.createdAt,
          effectiveLimit: after.effectiveLimit,
          remaining: after.remaining,
        },
        before: { reason: input.reason },
        after: { reason: input.reason },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new QuotaGrantPersistenceConflict();
      }
      throw error;
    }
  }

  async resolveIdempotentResult(input: GrantQuotaInput, now = new Date()) {
    return this.prisma.$transaction(async (transaction) => {
      const idempotencyKeyHash = this.hash(`${input.actorUserId}:${input.idempotencyKey}`);
      const requestFingerprint = this.hash(JSON.stringify({
        targetUserId: input.targetUserId,
        category: input.category,
        amount: input.amount,
        expiresAt: input.expiresAt.toISOString(),
        reason: input.reason,
      }));
      const grant = await transaction.quotaGrant.findUnique({
        where: { grantedByUserId_idempotencyKeyHash: { grantedByUserId: input.actorUserId, idempotencyKeyHash } },
        select: { id: true, targetUserId: true, category: true, amount: true, expiresAt: true, createdAt: true, requestFingerprint: true },
      });
      if (!grant || grant.requestFingerprint !== requestFingerprint) {
        throw new ConflictException('Idempotency key is already used for another request');
      }
      const quota = await this.effectiveQuotaInTransaction(transaction, grant.targetUserId, grant.category, now);
      return {
        grantId: grant.id,
        targetUserId: grant.targetUserId,
        category: grant.category,
        amount: grant.amount,
        expiresAt: grant.expiresAt,
        status: grant.expiresAt.getTime() > now.getTime() ? 'active' as const : 'expired' as const,
        createdAt: grant.createdAt,
        effectiveLimit: quota.effectiveLimit,
        remaining: quota.remaining,
      };
    });
  }

  private calculateEffectiveQuota(
    used: number,
    planLimit: number,
    grantAmount: number,
    additionalGrantAmount = 0,
  ): BillingQuotaValue {
    if (planLimit >= UNLIMITED_PLAN_LIMIT) {
      return { used, planLimit, grantAmount: 0, effectiveLimit: null, remaining: null, unlimited: true };
    }
    const boundedAdd = (base: number, amount: number): number =>
      amount >= MAX_FINITE_QUOTA_LIMIT - base ? MAX_FINITE_QUOTA_LIMIT : base + amount;
    const effectiveLimit = boundedAdd(boundedAdd(planLimit, grantAmount), additionalGrantAmount);
    return {
      used,
      planLimit,
      grantAmount,
      effectiveLimit,
      remaining: Math.max(0, effectiveLimit - used),
      unlimited: false,
    };
  }

  private nextMonthlyReset(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}

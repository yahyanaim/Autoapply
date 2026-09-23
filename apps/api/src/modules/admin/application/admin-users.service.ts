import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionPlan, UserRole, UserStatus } from '@prisma/client';
import { AuthService } from '../../auth/application/auth.service';
import {
  BillingUsageCategorySummary,
  BillingUsageReadService,
} from '../../billing/application/billing-usage-read.service';
import {
  AdminMutationContext,
  AdminMutationExecutor,
} from './admin-mutation.executor';

export interface SuspendAdminUserInput {
  context: AdminMutationContext;
  targetUserId: string;
  reason: string;
  stepUpProof: string;
}

export interface ReactivateAdminUserInput {
  context: AdminMutationContext;
  targetUserId: string;
  stepUpProof: string;
}

export interface ListAdminUsersInput {
  cursor?: string;
  limit?: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  plan?: SubscriptionPlan;
}

export interface ListAdminUserSessionsInput {
  targetUserId: string;
  currentSessionId?: string;
  cursor?: string;
  limit?: number;
}

const DEFAULT_PAGE_SIZE = 20;
export const MAX_ADMIN_USERS_PAGE_SIZE = 100;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly mutations: AdminMutationExecutor,
    private readonly auth: AuthService,
    private readonly billingUsage: BillingUsageReadService,
  ) {}

  async list(input: ListAdminUsersInput) {
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1),
      MAX_ADMIN_USERS_PAGE_SIZE,
    );
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const search = input.search?.trim().toLowerCase().replace(/\s+/g, ' ');
    const rows = await this.auth.listAdminUsers({
      limit,
      cursor,
      ...(search ? { search } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.plan ? { plan: input.plan } : {}),
    });
    const hasNextPage = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      users: page.map((user) => this.toSafeUser(user)),
      limit,
      nextCursor:
        hasNextPage && last
          ? this.encodeCursor(last.createdAt, last.id)
          : null,
    };
  }

  async detail(userId: string) {
    const user = await this.auth.getAdminUser(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.toSafeUser(user);
  }

  async usageLimits(userId: string) {
    const summary = await this.billingUsage.getUsageSummaryForAdmin(userId);
    return {
      userId: summary.userId,
      plan: summary.plan,
      period: summary.period,
      resetAt: summary.resetAt.toISOString(),
      usage: {
        applications: this.toSafeUsageCategory(summary.usage.applications),
        aiRequests: this.toSafeUsageCategory(summary.usage.aiRequests),
        resumeOptimizations: this.toSafeUsageCategory(
          summary.usage.resumeOptimizations,
        ),
        jobDiscoveries: this.toSafeUsageCategory(summary.usage.jobDiscoveries),
        resumes: this.toSafeUsageCategory(summary.usage.resumes),
        storageBytes: this.toSafeUsageCategory(summary.usage.storageBytes),
      },
    };
  }

  async sessions(input: ListAdminUserSessionsInput) {
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1),
      MAX_ADMIN_USERS_PAGE_SIZE,
    );
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const result = await this.auth.listAdminUserSessions({
      userId: input.targetUserId,
      limit,
      cursor,
    });
    if (!result) throw new NotFoundException('User not found');

    const hasNextPage = result.sessions.length > limit;
    const page = result.sessions.slice(0, limit);
    const last = page.at(-1);
    return {
      sessions: page.map((session) => ({
        id: session.id,
        clientType: session.clientType,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current:
          Boolean(input.currentSessionId) &&
          session.id === input.currentSessionId,
      })),
      limit,
      nextCursor:
        hasNextPage && last
          ? this.encodeCursor(last.createdAt, last.id)
          : null,
    };
  }

  suspend(input: SuspendAdminUserInput) {
    return this.mutations.execute({
      context: input.context,
      proof: input.stepUpProof,
      action: 'admin.user.suspend',
      targetType: 'user',
      targetId: input.targetUserId,
      command: (transaction) =>
        this.auth.suspendUserInTransaction(
          transaction,
          input.context.actorUserId,
          input.targetUserId,
          input.reason,
        ),
    });
  }

  reactivateUser(input: ReactivateAdminUserInput) {
    return this.mutations.execute({
      context: input.context,
      proof: input.stepUpProof,
      action: 'admin.user.reactivate',
      targetType: 'user',
      targetId: input.targetUserId,
      command: (transaction) =>
        this.auth.reactivateUserInTransaction(
          transaction,
          input.context.actorUserId,
          input.targetUserId,
        ),
    });
  }

  private toSafeUser(user: {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    isEmailVerified: boolean;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    subscription: { plan: SubscriptionPlan } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      plan: user.subscription?.plan ?? null,
      isEmailVerified: user.isEmailVerified,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private toSafeUsageCategory(category: BillingUsageCategorySummary) {
    return {
      used: category.used,
      limit: category.limit,
      remaining: category.remaining,
      unlimited: category.unlimited,
    };
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ createdAt: createdAt.toISOString(), id }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { createdAt?: unknown; id?: unknown };
      if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
        throw new Error('Invalid cursor shape');
      }
      const createdAt = new Date(parsed.createdAt);
      if (Number.isNaN(createdAt.getTime()) || parsed.id.length === 0) {
        throw new Error('Invalid cursor value');
      }
      return { createdAt, id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }
}

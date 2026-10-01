import {
  QuotaGrantCategory,
  QuotaGrantReason,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createHash } from 'node:crypto';
import { AdminAuditService } from '../src/modules/admin/application/admin-audit.service';
import { AdminMutationExecutor } from '../src/modules/admin/application/admin-mutation.executor';
import { AdminQuotaService } from '../src/modules/admin/application/admin-quota.service';
import { AdminStepUpMfaService } from '../src/modules/admin/application/admin-step-up-mfa.service';
import {
  BillingQuotaService,
  QuotaGrantPersistenceConflict,
  QuotaGrantReplay,
} from '../src/modules/billing/application/billing-quota.service';

const runId = `admin-quota-grant-${process.pid}-${Date.now()}`;
const proofFor = (label: string) => createHash('sha256').update(`${runId}:${label}`).digest('base64url');

describe('Billing-owned quota grant PostgreSQL integration', () => {
  let prisma: PrismaService;
  let quota: BillingQuotaService;
  let actorUserId: string;
  let targetUserId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error('Integration tests require an isolated DATABASE_URL containing "test"');
    }
    prisma = new PrismaService();
    await prisma.$connect();
    quota = new BillingQuotaService(prisma);
    const actor = await prisma.user.create({
      data: { email: `${runId}-admin@example.test`, role: UserRole.platform_admin },
    });
    actorUserId = actor.id;
    const target = await prisma.user.create({
      data: {
        email: `${runId}-target@example.test`,
        subscription: {
          create: { plan: SubscriptionPlan.free, status: SubscriptionStatus.active },
        },
        usageLimit: {
          create: {
            period: 'monthly',
            applicationsUsed: 10,
            resetAt: new Date('2026-11-01T00:00:00.000Z'),
          },
        },
      },
    });
    targetUserId = target.id;
  });

  afterAll(async () => {
    await prisma?.activityLog.deleteMany({ where: { action: 'admin.quota.grant', targetId: targetUserId } });
    await prisma?.adminStepUpMfaProof.deleteMany({ where: { actorUserId } });
    await prisma?.quotaGrant.deleteMany({
      where: { OR: [{ targetUserId }, { grantedByUserId: actorUserId }] },
    });
    await prisma?.user.deleteMany({ where: { email: { startsWith: runId } } });
    await prisma?.$disconnect();
  });

  it('resolves concurrent identical requests to one durable grant and preserves usage', async () => {
    const input = {
      targetUserId,
      actorUserId,
      category: QuotaGrantCategory.applications,
      amount: 5,
      expiresAt: new Date('2026-10-31T23:59:59.000Z'),
      reason: QuotaGrantReason.customer_support,
      idempotencyKey: `${runId}-same-intent`,
      now: new Date('2026-10-01T12:00:00.000Z'),
    };
    const request = async () => {
      try {
        const result = await prisma.$transaction((transaction) =>
          quota.grantInTransaction(transaction, input),
        );
        return result.value;
      } catch (error) {
        if (error instanceof QuotaGrantReplay || error instanceof QuotaGrantPersistenceConflict) {
          return quota.resolveIdempotentResult(input);
        }
        throw error;
      }
    };
    const [first, second] = await Promise.all([request(), request()]);
    expect(second).toEqual(first);
    await expect(prisma.quotaGrant.count({ where: { targetUserId } })).resolves.toBe(1);
    await expect(prisma.usageLimit.findUniqueOrThrow({ where: { userId: targetUserId } })).resolves.toEqual(
      expect.objectContaining({ applicationsUsed: 10 }),
    );
    const persisted = await prisma.quotaGrant.findFirstOrThrow({ where: { targetUserId } });
    expect(persisted).toEqual(expect.objectContaining({
      amount: 5,
      idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(JSON.stringify(persisted)).not.toContain(input.idempotencyKey);
  });

  it('rolls back a grant if a later audit-stage failure aborts the transaction', async () => {
    const input = {
      targetUserId,
      actorUserId,
      category: QuotaGrantCategory.ai_requests,
      amount: 3,
      expiresAt: new Date('2026-10-31T23:59:59.000Z'),
      reason: QuotaGrantReason.service_recovery,
      idempotencyKey: `${runId}-rollback`,
      now: new Date('2026-10-01T12:00:00.000Z'),
    };
    await expect(
      prisma.$transaction(async (transaction) => {
        await quota.grantInTransaction(transaction, input);
        throw new Error('synthetic audit failure');
      }),
    ).rejects.toThrow('synthetic audit failure');
    await expect(
      prisma.quotaGrant.count({
        where: { grantedByUserId: actorUserId, category: QuotaGrantCategory.ai_requests },
      }),
    ).resolves.toBe(0);
  });

  it('commits exactly one redacted audit event for concurrent identical Admin requests', async () => {
    const proofs = [
      proofFor('first'),
      proofFor('second'),
    ];
    const binding = {
      actorUserId,
      sessionId: 'session-quota-integration',
      action: 'admin.quota.grant',
      targetType: 'user',
      targetId: targetUserId,
    };
    await prisma.adminStepUpMfaProof.createMany({
      data: proofs.map((proof) => ({
        ...binding,
        proofHash: createHash('sha256').update(proof).digest('hex'),
        expiresAt: new Date(Date.now() + 300_000),
      })),
    });
    const service = new AdminQuotaService(
      new AdminMutationExecutor(
        prisma,
        new AdminStepUpMfaService(prisma, {} as never),
        new AdminAuditService(prisma),
      ),
      quota,
    );
    const expiresAt = new Date(Date.now() + 86_400_000);
    const request = (stepUpProof: string) => service.grant({
      context: {
        actorUserId,
        sessionId: binding.sessionId,
        role: UserRole.platform_admin,
        mfaVerified: true,
        correlationId: 'request_quota123',
      },
      targetUserId,
      category: QuotaGrantCategory.job_discoveries,
      amount: 2,
      expiresAt,
      reason: QuotaGrantReason.service_recovery,
      idempotencyKey: `${runId}-admin-audit`,
      stepUpProof,
    });
    const [first, second] = await Promise.all(proofs.map(request));
    expect(second).toEqual(first);
    const events = await prisma.activityLog.findMany({
      where: { action: 'admin.quota.grant', targetId: targetUserId },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      type: 'admin_quota_grant',
      actorUserId,
      targetType: 'user',
      correlationId: 'request_quota123',
      ipAddress: null,
      userAgent: null,
    }));
    expect(JSON.stringify(events)).not.toMatch(/quota-proof|idempotency|token|hash|mfa|password/i);
    for (const proof of proofs) expect(JSON.stringify(events)).not.toContain(proof);
    const proofRows = await prisma.adminStepUpMfaProof.findMany({ where: binding });
    expect(proofRows.filter((row) => row.usedAt !== null)).toHaveLength(1);
  });

  it('serializes different large grants so their combined limit cannot overflow', async () => {
    const proofs = [
      proofFor('limit-first'),
      proofFor('limit-second'),
    ];
    const binding = {
      actorUserId,
      sessionId: 'session-quota-overflow',
      action: 'admin.quota.grant',
      targetType: 'user',
      targetId: targetUserId,
    };
    await prisma.adminStepUpMfaProof.createMany({
      data: proofs.map((proof) => ({
        ...binding,
        proofHash: createHash('sha256').update(proof).digest('hex'),
        expiresAt: new Date(Date.now() + 300_000),
      })),
    });
    const service = new AdminQuotaService(
      new AdminMutationExecutor(
        prisma,
        new AdminStepUpMfaService(prisma, {} as never),
        new AdminAuditService(prisma),
      ),
      quota,
    );
    const expiresAt = new Date(Date.now() + 86_400_000);
    const outcomes = await Promise.allSettled(proofs.map((stepUpProof, index) => service.grant({
      context: {
        actorUserId,
        sessionId: binding.sessionId,
        role: UserRole.platform_admin,
        mfaVerified: true,
        correlationId: 'request_quota456',
      },
      targetUserId,
      category: QuotaGrantCategory.applications,
      amount: 1_100_000_000,
      expiresAt,
      reason: QuotaGrantReason.service_recovery,
      idempotencyKey: `${runId}-large-${index}`,
      stepUpProof,
    })));
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected && rejected.status === 'rejected' && rejected.reason)
      .toBeInstanceOf(ConflictException);
    await expect(prisma.quotaGrant.count({
      where: { targetUserId, category: QuotaGrantCategory.applications },
    })).resolves.toBe(2);
    await expect(prisma.activityLog.count({
      where: { action: 'admin.quota.grant', targetId: targetUserId },
    })).resolves.toBe(2);
  });

  it('applies active grants to all six real quota reservations across a monthly reset and stops at expiry', async () => {
    const now = new Date();
    const nextPeriod = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const expiresAt = new Date(nextPeriod.getTime() + 86_400_000);
    const categoryUser = await prisma.user.create({
      data: {
        email: `${runId}-six-categories@example.test`,
        subscription: { create: { plan: SubscriptionPlan.free, status: SubscriptionStatus.active } },
        usageLimit: {
          create: {
            period: 'monthly', resetAt: nextPeriod,
            applicationsUsed: 10, aiRequestsUsed: 5, resumeOptimizationsUsed: 1,
            jobDiscoveriesUsed: 3, resumesUsed: 1, storageBytesUsed: 5 * 1024 * 1024,
          },
        },
      },
    });
    const categories = [
      QuotaGrantCategory.applications,
      QuotaGrantCategory.ai_requests,
      QuotaGrantCategory.resume_optimizations,
      QuotaGrantCategory.job_discoveries,
      QuotaGrantCategory.resumes,
      QuotaGrantCategory.storage_bytes,
    ];
    for (const category of categories) {
      await prisma.$transaction((transaction) => quota.grantInTransaction(transaction, {
        targetUserId: categoryUser.id,
        actorUserId,
        category,
        amount: category === QuotaGrantCategory.storage_bytes ? 1024 : 1,
        expiresAt,
        reason: QuotaGrantReason.customer_support,
        idempotencyKey: `${runId}-${category}`,
        now,
      }));
    }
    for (const category of categories.slice(0, 4)) {
      await quota.reserve(categoryUser.id, category, 1, now, 'limit reached');
    }
    await prisma.$transaction((transaction) =>
      quota.reserveResumeStorageInTransaction(transaction, categoryUser.id, 1024, now),
    );
    const beforeReset = await quota.getUsageSummaryForAdmin(categoryUser.id, now);
    expect(Object.values(beforeReset.usage).map((entry) => entry.remaining)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(beforeReset.usage.applications.used).toBe(11);
    expect(beforeReset.usage.aiRequests.used).toBe(6);
    expect(beforeReset.usage.resumeOptimizations.used).toBe(2);
    expect(beforeReset.usage.jobDiscoveries.used).toBe(4);
    expect(beforeReset.usage.resumes.used).toBe(2);
    expect(beforeReset.usage.storageBytes.used).toBe(5 * 1024 * 1024 + 1024);

    const afterResetAt = new Date(nextPeriod.getTime() + 1000);
    const projected = await quota.getUsageSummaryForAdmin(categoryUser.id, afterResetAt);
    expect(projected.usage.applications.used).toBe(0);
    expect(projected.usage.applications.limit).toBe(11);
    expect((await prisma.usageLimit.findUniqueOrThrow({ where: { userId: categoryUser.id } })).applicationsUsed).toBe(11);
    await prisma.$transaction((transaction) => quota.resetPeriodicUsageInTransaction(transaction, categoryUser.id, afterResetAt));
    const afterReset = await quota.getUsageSummaryForAdmin(categoryUser.id, afterResetAt);
    expect(afterReset).toEqual(projected);
    expect(Object.values(afterReset.usage).map((entry) => entry.used)).toEqual([0, 0, 0, 0, 2, 5 * 1024 * 1024 + 1024]);
    expect(afterReset.usage.applications.limit).toBe(11);
    expect(afterReset.usage.aiRequests.limit).toBe(6);
    expect(afterReset.usage.resumeOptimizations.limit).toBe(2);
    expect(afterReset.usage.jobDiscoveries.limit).toBe(4);
    expect(afterReset.usage.resumes.limit).toBe(2);
    expect(afterReset.usage.storageBytes.limit).toBe(5 * 1024 * 1024 + 1024);

    const expired = await quota.getUsageSummaryForAdmin(categoryUser.id, expiresAt);
    expect(expired.usage.applications.limit).toBe(10);
    expect(expired.usage.aiRequests.limit).toBe(5);
    expect(expired.usage.resumeOptimizations.limit).toBe(1);
    expect(expired.usage.jobDiscoveries.limit).toBe(3);
    expect(expired.usage.resumes).toEqual({ used: 2, limit: 1, remaining: 0, unlimited: false });
    expect(expired.usage.storageBytes).toEqual({
      used: 5 * 1024 * 1024 + 1024, limit: 5 * 1024 * 1024, remaining: 0, unlimited: false,
    });
    await expect(prisma.quotaGrant.count({ where: { targetUserId: categoryUser.id } })).resolves.toBe(6);
  });

  it('keeps existing grants finite and enforceable across Pro, Premium, and Free plan transitions', async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 86_400_000);
    const planUser = await prisma.user.create({
      data: {
        email: `${runId}-plan-transition@example.test`,
        subscription: { create: { plan: SubscriptionPlan.free, status: SubscriptionStatus.active } },
        usageLimit: { create: { period: 'monthly', resetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) } },
      },
    });
    for (const [index, amount] of [2_000_000_000, 147_483_300].entries()) {
      await prisma.$transaction((transaction) => quota.grantInTransaction(transaction, {
        targetUserId: planUser.id, actorUserId,
        category: QuotaGrantCategory.ai_requests, amount, expiresAt,
        reason: QuotaGrantReason.service_recovery,
        idempotencyKey: `${runId}-plan-${index}`, now,
      }));
    }
    expect((await quota.getUsageSummaryForAdmin(planUser.id, now)).usage.aiRequests.limit).toBe(2_147_483_305);
    await prisma.subscription.updateMany({ where: { userId: planUser.id }, data: { plan: SubscriptionPlan.pro } });
    const upgraded = await quota.getUsageSummaryForAdmin(planUser.id, now);
    expect(upgraded.usage.aiRequests).toEqual({ used: 0, limit: 2_147_483_646, remaining: 2_147_483_646, unlimited: false });
    await quota.reserve(planUser.id, QuotaGrantCategory.ai_requests, 1, now, 'limit reached');
    expect((await quota.getUsageSummaryForAdmin(planUser.id, now)).usage.aiRequests).toEqual({
      used: 1, limit: 2_147_483_646, remaining: 2_147_483_645, unlimited: false,
    });
    await prisma.subscription.updateMany({ where: { userId: planUser.id }, data: { plan: SubscriptionPlan.premium } });
    expect((await quota.getUsageSummaryForAdmin(planUser.id, now)).usage.aiRequests).toEqual({
      used: 1, limit: null, remaining: null, unlimited: true,
    });
    await prisma.subscription.updateMany({ where: { userId: planUser.id }, data: { plan: SubscriptionPlan.free } });
    expect((await quota.getUsageSummaryForAdmin(planUser.id, now)).usage.aiRequests.limit).toBe(2_147_483_305);
    await expect(prisma.quotaGrant.count({ where: { targetUserId: planUser.id } })).resolves.toBe(2);
  });

  it('rolls back a real audit write, proof consumption, and grant together, then succeeds once on retry', async () => {
    const proof = proofFor('audit-rollback');
    const binding = {
      actorUserId, sessionId: 'session-quota-audit-rollback',
      action: 'admin.quota.grant', targetType: 'user', targetId: targetUserId,
    };
    const proofRow = await prisma.adminStepUpMfaProof.create({
      data: { ...binding, proofHash: createHash('sha256').update(proof).digest('hex'), expiresAt: new Date(Date.now() + 300_000) },
    });
    const idempotencyKey = `${runId}-audit-rollback`;
    const keyHash = createHash('sha256').update(`${actorUserId}:${idempotencyKey}`).digest('hex');
    const realAudit = new AdminAuditService(prisma);
    const failingAudit = {
      write: async (transaction: Parameters<AdminAuditService['write']>[0], record: Parameters<AdminAuditService['write']>[1]) => {
        await realAudit.write(transaction, record);
        throw new Error('synthetic audit persistence failure');
      },
    } as unknown as AdminAuditService;
    const makeService = (audit: AdminAuditService) => new AdminQuotaService(
      new AdminMutationExecutor(prisma, new AdminStepUpMfaService(prisma, {} as never), audit), quota,
    );
    const input = {
      context: {
        actorUserId, sessionId: binding.sessionId, role: UserRole.platform_admin,
        mfaVerified: true, correlationId: 'request_rollback123',
      },
      targetUserId, category: QuotaGrantCategory.resume_optimizations,
      amount: 2, expiresAt: new Date(Date.now() + 86_400_000),
      reason: QuotaGrantReason.service_recovery, idempotencyKey, stepUpProof: proof,
    };
    const auditBefore = await prisma.activityLog.count({ where: { action: 'admin.quota.grant', targetId: targetUserId } });
    await expect(makeService(failingAudit).grant(input)).rejects.toThrow('synthetic audit persistence failure');
    await expect(prisma.quotaGrant.count({ where: { idempotencyKeyHash: keyHash } })).resolves.toBe(0);
    await expect(prisma.activityLog.count({ where: { action: 'admin.quota.grant', targetId: targetUserId } })).resolves.toBe(auditBefore);
    expect((await prisma.adminStepUpMfaProof.findUniqueOrThrow({ where: { id: proofRow.id } })).usedAt).toBeNull();

    const result = await makeService(realAudit).grant(input);
    expect(result).toEqual(expect.objectContaining({ targetUserId, status: 'active' }));
    await expect(prisma.quotaGrant.count({ where: { idempotencyKeyHash: keyHash } })).resolves.toBe(1);
    await expect(prisma.activityLog.count({ where: { action: 'admin.quota.grant', targetId: targetUserId } })).resolves.toBe(auditBefore + 1);
    expect((await prisma.adminStepUpMfaProof.findUniqueOrThrow({ where: { id: proofRow.id } })).usedAt).not.toBeNull();
  });

  it('replays an expired durable grant without another grant, proof use, or audit event', async () => {
    const expiresAt = new Date(Date.now() - 60_000);
    const createdAt = new Date(expiresAt.getTime() - 86_400_000);
    const idempotencyKey = `${runId}-expired-replay`;
    const input = {
      targetUserId, actorUserId, category: QuotaGrantCategory.ai_requests,
      amount: 1, expiresAt, reason: QuotaGrantReason.customer_support,
    };
    const idempotencyKeyHash = createHash('sha256').update(`${actorUserId}:${idempotencyKey}`).digest('hex');
    const requestFingerprint = createHash('sha256').update(JSON.stringify({
      targetUserId, category: input.category, amount: input.amount,
      expiresAt: expiresAt.toISOString(), reason: input.reason,
    })).digest('hex');
    const original = await prisma.quotaGrant.create({
      data: {
        targetUserId, grantedByUserId: actorUserId, category: input.category,
        amount: input.amount, expiresAt, reason: input.reason,
        idempotencyKeyHash, requestFingerprint, createdAt,
        effectiveLimitAtCreation: 6, remainingAtCreation: 4,
      },
    });
    const proof = proofFor('expired-replay');
    const binding = {
      actorUserId, sessionId: 'session-quota-expired-replay',
      action: 'admin.quota.grant', targetType: 'user', targetId: targetUserId,
    };
    const proofRow = await prisma.adminStepUpMfaProof.create({
      data: { ...binding, proofHash: createHash('sha256').update(proof).digest('hex'), expiresAt: new Date(Date.now() + 300_000) },
    });
    const service = new AdminQuotaService(
      new AdminMutationExecutor(prisma, new AdminStepUpMfaService(prisma, {} as never), new AdminAuditService(prisma)),
      quota,
    );
    const auditBefore = await prisma.activityLog.count({ where: { action: 'admin.quota.grant', targetId: targetUserId } });
    const response = await service.grant({
      context: {
        actorUserId, sessionId: binding.sessionId, role: UserRole.platform_admin,
        mfaVerified: true, correlationId: 'request_expired123',
      },
      ...input, idempotencyKey, stepUpProof: proof,
    });
    expect(response).toEqual(expect.objectContaining({
      grantId: original.id, status: 'expired', effectiveLimit: 5,
    }));
    await expect(prisma.quotaGrant.count({ where: { idempotencyKeyHash } })).resolves.toBe(1);
    await expect(prisma.activityLog.count({ where: { action: 'admin.quota.grant', targetId: targetUserId } })).resolves.toBe(auditBefore);
    expect((await prisma.adminStepUpMfaProof.findUniqueOrThrow({ where: { id: proofRow.id } })).usedAt).toBeNull();
  });

  it('preserves a grant when its administrator is deleted and removes it with its target account', async () => {
    await prisma.user.delete({ where: { id: actorUserId } });
    const retained = await prisma.quotaGrant.findFirstOrThrow({ where: { targetUserId } });
    expect(retained.grantedByUserId).toBeNull();

    await prisma.user.delete({ where: { id: targetUserId } });
    await expect(prisma.quotaGrant.count({ where: { targetUserId } })).resolves.toBe(0);
  });
});

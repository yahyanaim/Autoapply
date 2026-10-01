import { QuotaGrantCategory, QuotaGrantReason, UserRole } from '@prisma/client';
import { AdminQuotaService } from './admin-quota.service';

describe('AdminQuotaService', () => {
  it('binds the owning command to the actor, session, target, and audit action', async () => {
    const expiresAt = new Date('2026-10-10T00:00:00.000Z');
    const quota = { grantInTransaction: jest.fn().mockResolvedValue({ value: { grantId: 'grant-1' } }) };
    const mutations = {
      execute: jest.fn(async (input: any) => input.command({ transaction: true })),
    };
    const service = new AdminQuotaService(mutations as never, quota as never);
    await service.grant({
      context: {
        actorUserId: 'admin-1', sessionId: 'session-1', role: UserRole.platform_admin,
        mfaVerified: true, correlationId: 'request_12345678',
      },
      targetUserId: 'user-1', category: QuotaGrantCategory.ai_requests,
      amount: 10, expiresAt, reason: QuotaGrantReason.service_recovery,
      idempotencyKey: 'quota-request-0001', stepUpProof: 'proof-value',
    });
    expect(mutations.execute).toHaveBeenCalledWith(expect.objectContaining({
      proof: 'proof-value', action: 'admin.quota.grant', targetType: 'user', targetId: 'user-1',
    }));
    expect(quota.grantInTransaction).toHaveBeenCalledWith(
      { transaction: true },
      expect.objectContaining({
        targetUserId: 'user-1', actorUserId: 'admin-1',
        category: QuotaGrantCategory.ai_requests, amount: 10,
        reason: QuotaGrantReason.service_recovery,
        idempotencyKey: 'quota-request-0001',
      }),
    );
  });
});

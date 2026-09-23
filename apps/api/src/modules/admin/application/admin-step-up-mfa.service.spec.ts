import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AdminStepUpMfaService } from './admin-step-up-mfa.service';

const binding = { actorUserId: 'actor', sessionId: 'session', action: 'suspend', targetType: 'user', targetId: 'target' };
const now = new Date('2026-09-21T00:00:00.000Z');

describe('AdminStepUpMfaService', () => {
  const mfa = { verifyFreshTotp: jest.fn() };
  const proof = { create: jest.fn(), updateMany: jest.fn() };
  const attempt = { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() };
  const transaction = { adminStepUpMfaProof: proof, adminStepUpMfaAttempt: attempt };
  const persistedAttempt = { findUnique: jest.fn() };
  const prisma = {
    $transaction: jest.fn(async (fn) => fn(transaction)),
    adminStepUpMfaAttempt: persistedAttempt,
    adminStepUpMfaProof: proof,
  };
  const clock = { now: () => now, nowMs: () => now.getTime() };
  let service: AdminStepUpMfaService;
  beforeEach(() => {
    jest.clearAllMocks();
    persistedAttempt.findUnique.mockResolvedValue(null);
    attempt.findUnique.mockResolvedValue(null);
    attempt.upsert.mockResolvedValue({});
    service = new AdminStepUpMfaService(prisma as never, mfa as never, clock as never);
  });

  it('issues a five-minute bound proof and persists only its hash', async () => {
    mfa.verifyFreshTotp.mockResolvedValue(true);
    const issued = await service.issue(binding, '123456');
    expect(mfa.verifyFreshTotp).toHaveBeenCalledWith('actor', '123456');
    expect(issued.expiresAt.getTime()).toBe(now.getTime() + 300000);
    expect(attempt.deleteMany).toHaveBeenCalledWith({ where: binding });
    expect(proof.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ...binding, proofHash: createHash('sha256').update(issued.proof).digest('hex') }) }));
    expect(JSON.stringify(proof.create.mock.calls)).not.toContain(issued.proof);
  });

  it('rejects invalid TOTP without persisting secrets or proof data', async () => {
    mfa.verifyFreshTotp.mockResolvedValue(false);
    await expect(service.issue(binding, '123456')).rejects.toThrow('Step-up verification failed');
    expect(attempt.upsert).toHaveBeenCalledWith({
      where: { actorUserId_sessionId_action_targetType_targetId: binding },
      create: expect.objectContaining({ ...binding, failedAttempts: 1, windowStartedAt: now, lockedUntil: new Date(now.getTime() + 30_000) }),
      update: expect.objectContaining({ failedAttempts: 1, windowStartedAt: now, lockedUntil: new Date(now.getTime() + 30_000) }),
    });
    expect(proof.create).not.toHaveBeenCalled();
  });

  it('persists the next failure from the existing durable state', async () => {
    attempt.findUnique.mockResolvedValue({
      failedAttempts: 2,
      windowStartedAt: new Date(now.getTime() - 60_000),
      lockedUntil: new Date(now.getTime() - 1),
    });
    mfa.verifyFreshTotp.mockResolvedValue(false);

    await expect(service.issue(binding, '123456')).rejects.toThrow('Step-up verification failed');

    expect(attempt.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: {
        failedAttempts: 3,
        windowStartedAt: new Date(now.getTime() - 60_000),
        lockedUntil: new Date(now.getTime() + 300_000),
      },
    }));
  });

  it('resets an expired fifteen-minute attempt window', async () => {
    attempt.findUnique.mockResolvedValue({
      failedAttempts: 5,
      windowStartedAt: new Date(now.getTime() - 15 * 60_000),
      lockedUntil: new Date(now.getTime() - 1),
    });
    mfa.verifyFreshTotp.mockResolvedValue(false);

    await expect(service.issue(binding, '123456')).rejects.toThrow('Step-up verification failed');

    expect(attempt.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: {
        failedAttempts: 1,
        windowStartedAt: now,
        lockedUntil: new Date(now.getTime() + 30_000),
      },
    }));
  });

  it('rejects an active lock before calling the Auth MFA facade', async () => {
    persistedAttempt.findUnique.mockResolvedValue({
      failedAttempts: 3,
      windowStartedAt: now,
      lockedUntil: new Date(now.getTime() + 1),
    });

    await expect(service.issue(binding, '123456')).rejects.toThrow('Step-up verification failed');

    expect(mfa.verifyFreshTotp).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(attempt.upsert).not.toHaveBeenCalled();
    expect(proof.create).not.toHaveBeenCalled();
  });

  it('re-checks an active durable lock after the single MFA verification', async () => {
    attempt.findUnique.mockResolvedValue({
      failedAttempts: 3,
      windowStartedAt: now,
      lockedUntil: new Date(now.getTime() + 1),
    });
    mfa.verifyFreshTotp.mockResolvedValue(true);

    await expect(service.issue(binding, '123456')).rejects.toThrow('Step-up verification failed');

    expect(mfa.verifyFreshTotp).toHaveBeenCalledTimes(1);
    expect(attempt.deleteMany).not.toHaveBeenCalled();
    expect(proof.create).not.toHaveBeenCalled();
  });

  it('records an admitted invalid failure from the latest count despite a competing lock', async () => {
    attempt.findUnique.mockResolvedValue({
      failedAttempts: 1,
      windowStartedAt: now,
      lockedUntil: new Date(now.getTime() + 30_000),
    });
    mfa.verifyFreshTotp.mockResolvedValue(false);

    await expect(service.issue(binding, '123456')).rejects.toThrow('Step-up verification failed');

    expect(mfa.verifyFreshTotp).toHaveBeenCalledTimes(1);
    expect(attempt.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: {
        failedAttempts: 2,
        windowStartedAt: now,
        lockedUntil: new Date(now.getTime() + 60_000),
      },
    }));
  });

  it('never increments an admitted invalid failure beyond five', async () => {
    attempt.findUnique.mockResolvedValue({
      failedAttempts: 5,
      windowStartedAt: now,
      lockedUntil: new Date(now.getTime() + 15 * 60_000),
    });
    mfa.verifyFreshTotp.mockResolvedValue(false);

    await expect(service.issue(binding, '123456')).rejects.toThrow('Step-up verification failed');

    expect(mfa.verifyFreshTotp).toHaveBeenCalledTimes(1);
    expect(attempt.upsert).not.toHaveBeenCalled();
  });

  it('resets attempts in the same transaction after successful TOTP', async () => {
    attempt.findUnique.mockResolvedValue({
      failedAttempts: 2,
      windowStartedAt: now,
      lockedUntil: new Date(now.getTime() - 1),
    });
    mfa.verifyFreshTotp.mockResolvedValue(true);

    await service.issue(binding, '123456');

    expect(attempt.deleteMany).toHaveBeenCalledWith({ where: binding });
    expect(attempt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(proof.create.mock.invocationCallOrder[0]);
  });

  it('uses Prisma Serializable transactions and the composite unique key without raw SQL', async () => {
    mfa.verifyFreshTotp.mockResolvedValue(false);

    await expect(service.issue(binding, '123456')).rejects.toThrow('Step-up verification failed');

    expect(prisma).not.toHaveProperty('$queryRaw');
    expect(prisma).not.toHaveProperty('$executeRaw');
    expect(transaction).not.toHaveProperty('$queryRaw');
    expect(transaction).not.toHaveProperty('$executeRaw');
    expect(attempt.findUnique).toHaveBeenCalledWith({
      where: { actorUserId_sessionId_action_targetType_targetId: binding },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('retries P2034 conflicts and calls the MFA facade only once', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'write conflict',
      { code: 'P2034', clientVersion: '5.18.0' },
    );
    attempt.findUnique.mockRejectedValueOnce(conflict).mockResolvedValueOnce(null);
    mfa.verifyFreshTotp.mockResolvedValue(true);

    await expect(service.issue(binding, '123456')).resolves.toEqual({
      proof: expect.any(String),
      expiresAt: new Date(now.getTime() + 300_000),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mfa.verifyFreshTotp).toHaveBeenCalledTimes(1);
    expect(proof.create).toHaveBeenCalledTimes(1);
  });

  it('does not retry unknown transaction errors', async () => {
    const databaseError = new Error('database unavailable');
    attempt.findUnique.mockRejectedValueOnce(databaseError);
    mfa.verifyFreshTotp.mockResolvedValue(true);

    await expect(service.issue(binding, '123456')).rejects.toBe(databaseError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mfa.verifyFreshTotp).toHaveBeenCalledTimes(1);
    expect(proof.create).not.toHaveBeenCalled();
  });

  it('bounds P2034 retries and never repeats MFA verification', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'write conflict',
      { code: 'P2034', clientVersion: '5.18.0' },
    );
    attempt.findUnique.mockRejectedValue(conflict);
    mfa.verifyFreshTotp.mockResolvedValue(false);

    await expect(service.issue(binding, '123456')).rejects.toBe(conflict);

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(mfa.verifyFreshTotp).toHaveBeenCalledTimes(1);
    expect(attempt.upsert).not.toHaveBeenCalled();
  });

  it('does not call MFA when the durable pre-check fails', async () => {
    const databaseError = new Error('database unavailable');
    persistedAttempt.findUnique.mockRejectedValueOnce(databaseError);

    await expect(service.issue(binding, '123456')).rejects.toBe(databaseError);

    expect(mfa.verifyFreshTotp).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('propagates MFA facade failures and does not convert them into invalid-code errors', async () => {
    const facadeError = new Error('MFA dependency failed');
    mfa.verifyFreshTotp.mockRejectedValue(facadeError);

    await expect(service.issue(binding, '123456')).rejects.toBe(facadeError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(attempt.upsert).not.toHaveBeenCalled();
    expect(proof.create).not.toHaveBeenCalled();
  });

  it('uses a conditional update to reject expired, replayed, and mismatched proofs', async () => {
    proof.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.consume(binding, 'a'.repeat(43))).rejects.toThrow('Step-up proof is invalid');
    expect(proof.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ...binding, usedAt: null, expiresAt: { gt: now } }) }));
  });

  it('allows only one conditional consumption', async () => {
    proof.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(service.consume(binding, 'a'.repeat(43))).resolves.toBeUndefined();
    await expect(service.consume(binding, 'a'.repeat(43))).rejects.toThrow('Step-up proof is invalid');
  });
});

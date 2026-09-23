import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma/prisma.service';
import {
  AdminStepUpMfaService,
  StepUpBinding,
} from '../src/modules/admin/application/admin-step-up-mfa.service';

const start = new Date('2026-09-21T00:00:00.000Z');
const runId = `step-up-${process.pid}-${Date.now()}`;

describe('AdminStepUpMfaService PostgreSQL concurrency', () => {
  let prisma: PrismaService;
  let now: Date;
  let verifyFreshTotp: jest.Mock<Promise<boolean>, [string, string]>;
  let service: AdminStepUpMfaService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'Integration tests require an isolated DATABASE_URL containing "test"',
      );
    }
    prisma = new PrismaService();
    await prisma.$connect();
  });

  beforeEach(() => {
    now = new Date(start);
    verifyFreshTotp = jest.fn();
    service = new AdminStepUpMfaService(
      prisma,
      { verifyFreshTotp } as never,
      { now: () => new Date(now), nowMs: () => now.getTime() } as never,
    );
  });

  afterAll(async () => {
    await prisma?.adminStepUpMfaProof.deleteMany({
      where: { actorUserId: { startsWith: runId } },
    });
    await prisma?.adminStepUpMfaAttempt.deleteMany({
      where: { actorUserId: { startsWith: runId } },
    });
    await prisma?.$disconnect();
  });

  it('serializes concurrent failures without duplicate rows or lost increments', async () => {
    const binding = nextBinding('concurrent-failures');
    let arrivals = 0;
    let release!: () => void;
    const bothVerified = new Promise<void>((resolve) => {
      release = resolve;
    });
    verifyFreshTotp.mockImplementation(async () => {
      arrivals += 1;
      if (arrivals === 2) release();
      await bothVerified;
      return false;
    });

    const results = await Promise.allSettled([
      service.issue(binding, '111111'),
      service.issue(binding, '222222'),
    ]);

    expect(results.every(({ status }) => status === 'rejected')).toBe(true);
    expect(verifyFreshTotp).toHaveBeenCalledTimes(2);
    const rows = await prisma.adminStepUpMfaAttempt.findMany({
      where: binding,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      failedAttempts: 2,
      windowStartedAt: start,
      lockedUntil: new Date(start.getTime() + 60_000),
    });
  });

  it('persists all backoffs, enforces five attempts, and resets at fifteen minutes', async () => {
    const binding = nextBinding('limits');
    verifyFreshTotp.mockResolvedValue(false);
    const delays = [30_000, 60_000, 300_000, 900_000, 900_000];

    for (let index = 0; index < delays.length; index += 1) {
      await expect(service.issue(binding, '123456')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const attempt = await prisma.adminStepUpMfaAttempt.findUniqueOrThrow({
        where: {
          actorUserId_sessionId_action_targetType_targetId: binding,
        },
      });
      expect(attempt.failedAttempts).toBe(index + 1);
      expect(attempt.windowStartedAt).toEqual(start);
      expect(attempt.lockedUntil).toEqual(
        new Date(now.getTime() + delays[index]!),
      );
      await prisma.adminStepUpMfaAttempt.update({
        where: {
          actorUserId_sessionId_action_targetType_targetId: binding,
        },
        data: { lockedUntil: new Date(now.getTime() - 1) },
      });
    }

    await expect(service.issue(binding, '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyFreshTotp).toHaveBeenCalledTimes(6);
    await expect(
      prisma.adminStepUpMfaAttempt.findUniqueOrThrow({
        where: {
          actorUserId_sessionId_action_targetType_targetId: binding,
        },
      }),
    ).resolves.toMatchObject({ failedAttempts: 5 });

    now = new Date(start.getTime() + 15 * 60_000);
    await expect(service.issue(binding, '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      prisma.adminStepUpMfaAttempt.findUniqueOrThrow({
        where: {
          actorUserId_sessionId_action_targetType_targetId: binding,
        },
      }),
    ).resolves.toMatchObject({
      failedAttempts: 1,
      windowStartedAt: now,
      lockedUntil: new Date(now.getTime() + 30_000),
    });
  });

  it('caps concurrent admitted failures at five', async () => {
    const binding = nextBinding('concurrent-limit');
    await prisma.adminStepUpMfaAttempt.create({
      data: {
        ...binding,
        failedAttempts: 4,
        windowStartedAt: start,
        lockedUntil: new Date(start.getTime() - 1),
      },
    });
    let arrivals = 0;
    let release!: () => void;
    const bothVerified = new Promise<void>((resolve) => {
      release = resolve;
    });
    verifyFreshTotp.mockImplementation(async () => {
      arrivals += 1;
      if (arrivals === 2) release();
      await bothVerified;
      return false;
    });

    await Promise.allSettled([
      service.issue(binding, '111111'),
      service.issue(binding, '222222'),
    ]);

    expect(verifyFreshTotp).toHaveBeenCalledTimes(2);
    const rows = await prisma.adminStepUpMfaAttempt.findMany({ where: binding });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      failedAttempts: 5,
      windowStartedAt: start,
      lockedUntil: new Date(start.getTime() + 15 * 60_000),
    });
  });

  it('does not let a valid TOTP clear a lock created after admission', async () => {
    const binding = nextBinding('valid-lock-race');
    let validArrived!: () => void;
    let releaseValid!: () => void;
    const validAtFacade = new Promise<void>((resolve) => {
      validArrived = resolve;
    });
    const mayReturnValid = new Promise<void>((resolve) => {
      releaseValid = resolve;
    });
    verifyFreshTotp.mockImplementation(async (_actorUserId, code) => {
      if (code === '111111') {
        validArrived();
        await mayReturnValid;
        return true;
      }
      return false;
    });

    const validRequest = service.issue(binding, '111111');
    await validAtFacade;
    await expect(service.issue(binding, '222222')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    releaseValid();
    await expect(validRequest).rejects.toBeInstanceOf(UnauthorizedException);

    expect(verifyFreshTotp).toHaveBeenCalledTimes(2);
    await expect(
      prisma.adminStepUpMfaAttempt.findUniqueOrThrow({
        where: {
          actorUserId_sessionId_action_targetType_targetId: binding,
        },
      }),
    ).resolves.toMatchObject({
      failedAttempts: 1,
      lockedUntil: new Date(start.getTime() + 30_000),
    });
    await expect(
      prisma.adminStepUpMfaProof.count({ where: binding }),
    ).resolves.toBe(0);
  });

  it('clears attempts on success and permits exactly one concurrent proof consumption', async () => {
    const binding = nextBinding('success');
    await prisma.adminStepUpMfaAttempt.create({
      data: {
        ...binding,
        failedAttempts: 3,
        windowStartedAt: start,
        lockedUntil: new Date(start.getTime() - 1),
      },
    });
    verifyFreshTotp.mockResolvedValue(true);

    const issued = await service.issue(binding, '123456');

    await expect(
      prisma.adminStepUpMfaAttempt.findUnique({
        where: {
          actorUserId_sessionId_action_targetType_targetId: binding,
        },
      }),
    ).resolves.toBeNull();
    const persistedProof = await prisma.adminStepUpMfaProof.findFirstOrThrow({
      where: binding,
    });
    expect(persistedProof.proofHash).not.toBe(issued.proof);

    const consumed = await Promise.allSettled([
      service.consume(binding, issued.proof),
      service.consume(binding, issued.proof),
    ]);
    expect(consumed.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(consumed.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    await expect(
      prisma.adminStepUpMfaProof.findUniqueOrThrow({
        where: { proofHash: persistedProof.proofHash },
      }),
    ).resolves.toMatchObject({ usedAt: now });
  });

  function nextBinding(scenario: string): StepUpBinding {
    return {
      actorUserId: `${runId}-${scenario}`,
      sessionId: 'session',
      action: 'suspend',
      targetType: 'user',
      targetId: 'target',
    };
  }
});

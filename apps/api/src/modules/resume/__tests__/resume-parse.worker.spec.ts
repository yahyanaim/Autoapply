import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ResumeParseWorker } from '../infrastructure/queue/resume-parse.worker';

describe('ResumeParseWorker queue admission', () => {
  function createWorker(overrides: Record<string, unknown> = {}) {
    const config = { get: jest.fn() };
    const resumeService = {
      parse: jest.fn().mockResolvedValue({ id: 'r1' }),
      getResume: jest.fn().mockResolvedValue({
        parseStatus: 'pending',
        parsedJson: null,
      }),
      markParseFailed: jest.fn().mockResolvedValue(undefined),
    };
    const deadLetterQueue = {
      add: jest.fn().mockResolvedValue({ id: 'dlq_1' }),
      close: jest.fn(),
    };
    const prisma: any = {
      activityLog: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
      resume: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      resumeParseExecution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'execution-1',
          resumeId: 'r1',
          executionBoundary: 'free',
          status: 'queued',
          attemptCount: 0,
          maxAttempts: 3,
        }),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      resumeParseExecutionClaim: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'claim-1',
          attempt: 1,
          retryAuthorizedAttempt: null,
          leaseVersion: 0,
          leaseExpiresAt: null,
          executionId: 'execution-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction = jest.fn(
      (callback: (transaction: any) => unknown): unknown => callback(prisma),
    );
    const planAwareRouter = {
      resolve: jest.fn().mockResolvedValue({ boundary: 'free' }),
    };
    const signature = { verify: jest.fn().mockReturnValue(true) };
    const worker = new ResumeParseWorker(
      config as never,
      resumeService as never,
      { close: jest.fn() } as never,
      { close: jest.fn() } as never,
      deadLetterQueue as never,
      prisma as never,
      planAwareRouter as never,
      signature as never,
      { now: () => new Date('2026-09-15T00:00:00.000Z') } as never,
    );

    return {
      worker,
      resumeService,
      deadLetterQueue,
      prisma,
      planAwareRouter,
      signature,
      ...overrides,
    };
  }

  function signedFreeJob(overrides: Record<string, unknown> = {}) {
    return {
      id: 'resume-parse-free-r1',
      data: {
        resumeId: 'r1',
        userId: 'u1',
        executionBoundary: 'free',
        jobId: 'resume-parse-free-r1',
        signature: 'a'.repeat(64),
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      ...overrides,
    };
  }

  it('routes a terminal job once without retaining unsafe payload or error text', async () => {
    const { worker, deadLetterQueue } = createWorker();

    await worker.routeToDeadLetter(
      {
        id: 'resume-parse-r1',
        data: { resumeId: 'r1', userId: 'u1' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as never,
      new Error('provider timeout'),
      'resume-parse-free',
    );

    expect(deadLetterQueue.add).toHaveBeenCalledWith(
      'failed-resume-parse',
      expect.objectContaining({
        originalJobId: 'resume-parse-r1',
        originalQueue: 'resume-parse-free',
        attemptsMade: 3,
        failureCategory: 'internal_error',
      }),
      expect.objectContaining({
        jobId: 'resume-parse-dlq-resume-parse-r1',
        removeOnComplete: false,
        removeOnFail: false,
      }),
    );
  });

  it('classifies an expired terminal worker lease as an explicitly requeueable crash', async () => {
    const { worker, prisma, deadLetterQueue } = createWorker();
    prisma.resumeParseExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
      resumeId: 'r1',
      status: 'processing',
      claim: {
        id: 'claim-1',
        queueName: 'resume-parse-free',
        leaseVersion: 2,
        leaseExpiresAt: new Date('2026-09-14T23:59:59.000Z'),
      },
    });

    await (worker as any).handleTerminalFailure(
      signedFreeJob({ attemptsMade: 3 }),
      new Error('worker process exited'),
      'resume-parse-free',
      false,
    );

    expect(prisma.resumeParseExecution.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'execution-1',
        status: { in: ['processing', 'retrying'] },
      },
      data: {
        status: 'failed_requeueable',
        failureCategory: 'worker_crash',
        failedAt: new Date('2026-09-15T00:00:00.000Z'),
      },
    });
    expect(prisma.resume.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' } }),
    );
    expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
  });

  it('rejects a job copied to a different plan queue before verification or parsing', async () => {
    const { worker, signature, resumeService, planAwareRouter } = createWorker();
    const job = signedFreeJob({
      data: {
        ...signedFreeJob().data,
        executionBoundary: 'paid',
      },
    });

    await expect((worker as any).processJob('free', job)).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });

    expect(signature.verify).not.toHaveBeenCalled();
    expect(resumeService.getResume).not.toHaveBeenCalled();
    expect(planAwareRouter.resolve).not.toHaveBeenCalled();
    expect(resumeService.parse).not.toHaveBeenCalled();
  });

  it('rejects a signed payload when its bound BullMQ job ID differs from the delivery', async () => {
    const { worker, signature, resumeService, planAwareRouter } = createWorker();
    const job = signedFreeJob({
      id: 'different-job-id',
    });

    await expect((worker as any).processJob('free', job)).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });

    expect(signature.verify).not.toHaveBeenCalled();
    expect(resumeService.getResume).not.toHaveBeenCalled();
    expect(planAwareRouter.resolve).not.toHaveBeenCalled();
  });

  it('rejects a syntactically valid job whose signed identity was changed before ownership or parsing', async () => {
    const { worker, signature, resumeService, planAwareRouter } = createWorker();
    signature.verify.mockReturnValue(false);

    await expect(
      (worker as any).processJob('free', signedFreeJob()),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(signature.verify).toHaveBeenCalled();
    expect(resumeService.getResume).not.toHaveBeenCalled();
    expect(planAwareRouter.resolve).not.toHaveBeenCalled();
    expect(resumeService.parse).not.toHaveBeenCalled();
  });

  it('rejects a duplicate delivery when no prior failure authorized a retry', async () => {
    const { worker, prisma, resumeService, planAwareRouter } = createWorker();
    prisma.resumeParseExecutionClaim.create.mockRejectedValue({ code: 'P2002' });
    prisma.resumeParseExecutionClaim.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'claim-1',
        attempt: 1,
        retryAuthorizedAttempt: null,
        leaseVersion: 1,
        leaseExpiresAt: new Date('2026-09-15T00:05:00.000Z'),
        executionId: 'execution-1',
      });

    await expect(
      (worker as any).processJob('free', signedFreeJob()),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(prisma.resumeParseExecutionClaim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
        resumeId: 'r1',
        executionId: 'execution-1',
        queueName: 'resume-parse-free',
        jobId: 'resume-parse-free-r1',
        attempt: 1,
        }),
      }),
    );
    expect(planAwareRouter.resolve).not.toHaveBeenCalled();
    expect(resumeService.parse).not.toHaveBeenCalled();
    expect(resumeService.markParseFailed).not.toHaveBeenCalled();
  });

  it('does not treat a replayed original payload as a new retry merely because attemptsMade changed', async () => {
    const { worker, prisma, resumeService, planAwareRouter } = createWorker();
    prisma.resumeParseExecutionClaim.findUnique.mockResolvedValue({
      id: 'claim-1',
      attempt: 1,
      retryAuthorizedAttempt: null,
      leaseVersion: 1,
      leaseExpiresAt: new Date('2026-09-15T00:05:00.000Z'),
      executionId: 'execution-1',
    });

    await expect(
      (worker as any).processJob(
        'free',
        signedFreeJob({ attemptsMade: 1 }),
      ),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(prisma.resumeParseExecutionClaim.create).not.toHaveBeenCalled();
    expect(prisma.resumeParseExecutionClaim.updateMany).not.toHaveBeenCalled();
    expect(planAwareRouter.resolve).not.toHaveBeenCalled();
    expect(resumeService.parse).not.toHaveBeenCalled();
  });

  it('never trusts altered BullMQ retry options beyond the durable three-attempt cap', async () => {
    const { worker, prisma, resumeService } = createWorker();

    await expect(
      (worker as any).processJob(
        'free',
        signedFreeJob({ attemptsMade: 3, opts: { attempts: 100 } }),
      ),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(prisma.resumeParseExecutionClaim.findUnique).not.toHaveBeenCalled();
    expect(resumeService.parse).not.toHaveBeenCalled();
  });

  it('admits a later delivery only when the preceding real failure authorized that exact retry', async () => {
    const { worker, prisma, resumeService } = createWorker();
    prisma.resumeParseExecutionClaim.findUnique.mockResolvedValue({
      id: 'claim-1',
      attempt: 1,
      retryAuthorizedAttempt: 2,
      leaseVersion: 1,
      leaseExpiresAt: null,
      executionId: 'execution-1',
    });

    await expect(
      (worker as any).processJob('free', signedFreeJob({ attemptsMade: 1 })),
    ).resolves.toEqual({ id: 'r1' });

    expect(prisma.resumeParseExecutionClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attempt: 1,
          retryAuthorizedAttempt: 2,
        }),
        data: expect.objectContaining({
          attempt: 2,
          retryAuthorizedAttempt: null,
          leaseVersion: 2,
        }),
      }),
    );
    expect(resumeService.parse).toHaveBeenCalledTimes(1);
  });

  it('links a retained pre-migration claim to its durable execution without losing attempt history', async () => {
    const { worker, prisma, resumeService } = createWorker();
    prisma.resumeParseExecutionClaim.findUnique.mockResolvedValue({
      id: 'legacy-claim-1',
      attempt: 1,
      retryAuthorizedAttempt: null,
      leaseVersion: 0,
      leaseExpiresAt: null,
      executionId: null,
    });

    await expect(
      (worker as any).processJob('free', signedFreeJob()),
    ).resolves.toEqual({ id: 'r1' });

    expect(prisma.resumeParseExecutionClaim.create).not.toHaveBeenCalled();
    expect(prisma.resumeParseExecutionClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'legacy-claim-1',
          executionId: null,
          attempt: 1,
          leaseVersion: 0,
        }),
        data: expect.objectContaining({
          executionId: 'execution-1',
          attempt: 1,
          retryAuthorizedAttempt: null,
          leaseVersion: 1,
        }),
      }),
    );
    expect(resumeService.parse).toHaveBeenCalledWith(
      'r1',
      'free',
      expect.objectContaining({
        executionId: 'execution-1',
        claimId: 'legacy-claim-1',
        leaseVersion: 1,
      }),
    );
  });

  it('authorizes exactly one later BullMQ delivery only after a retryable parse failure', async () => {
    const { worker, prisma, resumeService } = createWorker();
    prisma.resumeParseExecutionClaim.updateMany.mockResolvedValue({ count: 1 });
    resumeService.parse.mockRejectedValue(
      new ServiceUnavailableException({ retryable: true }),
    );

    await expect(
      (worker as any).processJob('free', signedFreeJob()),
    ).rejects.toThrow('Resume parsing failed');

    expect(prisma.resumeParseExecutionClaim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attempt: 1,
          retryAuthorizedAttempt: null,
        }),
        data: expect.objectContaining({ retryAuthorizedAttempt: 2 }),
      }),
    );
    expect(resumeService.markParseFailed).not.toHaveBeenCalled();
  });

  it('does not authorize a retry for a non-retryable GLM failure', async () => {
    const { worker, prisma, resumeService } = createWorker();
    resumeService.parse.mockRejectedValue(
      new ServiceUnavailableException({ retryable: false }),
    );

    await expect(
      (worker as any).processJob('free', signedFreeJob()),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(prisma.resumeParseExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed_permanent' }),
      }),
    );
  });

  it('rejects a signed Free job when the current trusted entitlement is paid', async () => {
    const { worker, prisma, resumeService, planAwareRouter } = createWorker();
    planAwareRouter.resolve.mockResolvedValue({ boundary: 'paid' });

    await expect(
      (worker as any).processJob('free', signedFreeJob()),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(resumeService.parse).not.toHaveBeenCalled();
    expect(prisma.resumeParseExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed_permanent',
          failureCategory: 'entitlement_changed',
        }),
      }),
    );
  });

  it('passes the signed queue boundary to parsing only after claim and entitlement checks', async () => {
    const { worker, prisma, resumeService, planAwareRouter } = createWorker();

    await expect(
      (worker as any).processJob('free', signedFreeJob()),
    ).resolves.toEqual({ id: 'r1' });

    expect(prisma.resumeParseExecutionClaim.create).toHaveBeenCalled();
    expect(planAwareRouter.resolve).toHaveBeenCalledWith('u1');
    expect(resumeService.parse).toHaveBeenCalledWith(
      'r1',
      'free',
      expect.objectContaining({
        executionId: 'execution-1',
        claimId: 'claim-1',
        leaseVersion: 1,
      }),
    );
  });

  it('quarantines unsigned legacy jobs with redacted metadata and never executes their payload', async () => {
    const { worker, deadLetterQueue, resumeService, planAwareRouter, signature, prisma } =
      createWorker();

    await (worker as any).quarantineLegacyJob({
      id: 'legacy-job-1',
      data: {
        resumeId: 'do-not-read',
        userId: 'do-not-read',
        unexpected: 'do-not-read',
      },
      attemptsMade: 0,
      opts: { attempts: 1 },
    });

    expect(deadLetterQueue.add).toHaveBeenCalledWith(
      'failed-resume-parse',
      expect.objectContaining({
        originalJobId: 'legacy-job-1',
        originalQueue: 'resume-parse',
        attemptsMade: 0,
        legacy: true,
      }),
      expect.any(Object),
    );
    const payload = deadLetterQueue.add.mock.calls[0][1];
    expect(payload).not.toHaveProperty('resumeId');
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('unexpected');
    expect(signature.verify).not.toHaveBeenCalled();
    expect(resumeService.getResume).not.toHaveBeenCalled();
    expect(resumeService.parse).not.toHaveBeenCalled();
    expect(planAwareRouter.resolve).not.toHaveBeenCalled();
    expect(prisma.resumeParseExecutionClaim.create).not.toHaveBeenCalled();
  });

  it('rejects an ownership mismatch before the claim or parser', async () => {
    const { worker, resumeService, prisma, planAwareRouter } = createWorker();
    resumeService.getResume.mockRejectedValue(new ForbiddenException());

    await expect(
      (worker as any).processJob('free', signedFreeJob()),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(prisma.resumeParseExecutionClaim.create).not.toHaveBeenCalled();
    expect(planAwareRouter.resolve).not.toHaveBeenCalled();
    expect(resumeService.parse).not.toHaveBeenCalled();
  });
});

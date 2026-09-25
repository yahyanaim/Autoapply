import {
  ResumeParseDispatchStatus,
  ResumeParseExecutionStatus,
} from '@prisma/client';
import { ResumeParseDispatcher } from '../infrastructure/queue/resume-parse-dispatcher.service';

describe('ResumeParseDispatcher', () => {
  const now = new Date('2026-09-25T10:00:00.000Z');

  function createDispatcher() {
    const freeQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const paidQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const dispatchRecord = {
      id: 'dispatch-1',
      attemptCount: 1,
      execution: {
        id: 'execution-1',
        resumeId: 'resume-1',
        executionBoundary: 'free',
        queueJobId: 'resume-parse-free-resume-1-g1',
        resume: { userId: 'user-1' },
      },
    };
    const prisma: any = {
      resumeParseDispatch: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'dispatch-1',
            status: ResumeParseDispatchStatus.pending,
            leaseExpiresAt: null,
          })
          .mockResolvedValueOnce(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(dispatchRecord),
        update: jest.fn().mockResolvedValue({}),
      },
      resumeParseExecution: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      resume: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    const config = { get: jest.fn((_key: string, fallback: string) => fallback) };
    const signatures = { sign: jest.fn().mockReturnValue('a'.repeat(64)) };
    const dispatcher = new ResumeParseDispatcher(
      prisma,
      config as never,
      freeQueue as never,
      paidQueue as never,
      signatures as never,
      { now: () => now } as never,
    );
    return { dispatcher, prisma, freeQueue, paidQueue, signatures };
  }

  it('claims a bounded outbox record and dispatches one signed deterministic job', async () => {
    const { dispatcher, prisma, freeQueue, paidQueue, signatures } =
      createDispatcher();

    await expect(dispatcher.dispatchPending()).resolves.toBe(1);

    expect(prisma.resumeParseDispatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(freeQueue.add).toHaveBeenCalledWith(
      'parse-resume',
      {
        resumeId: 'resume-1',
        userId: 'user-1',
        executionBoundary: 'free',
        jobId: 'resume-parse-free-resume-1-g1',
        signature: 'a'.repeat(64),
      },
      expect.objectContaining({
        jobId: 'resume-parse-free-resume-1-g1',
        attempts: 3,
      }),
    );
    expect(signatures.sign).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'resume-parse-free-resume-1-g1' }),
    );
    expect(paidQueue.add).not.toHaveBeenCalled();
    expect(prisma.resumeParseExecution.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'execution-1',
        status: ResumeParseExecutionStatus.requeue_requested,
      },
      data: { status: 'queued', queuedAt: now },
    });
    expect(prisma.resumeParseDispatch.update).toHaveBeenCalledWith({
      where: { id: 'dispatch-1' },
      data: expect.objectContaining({ status: 'dispatched' }),
    });
  });

  it('keeps the durable dispatch pending with bounded backoff when Redis is unavailable', async () => {
    const { dispatcher, prisma, freeQueue } = createDispatcher();
    const logError = jest
      .spyOn((dispatcher as any).logger, 'error')
      .mockImplementation(() => undefined);
    freeQueue.add.mockRejectedValue(new Error('redis unavailable secret=hidden'));

    await expect(dispatcher.dispatchPending(1000)).resolves.toBe(0);

    expect(prisma.resumeParseDispatch.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.resumeParseDispatch.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'dispatch-1',
        status: ResumeParseDispatchStatus.dispatching,
      },
      data: expect.objectContaining({
        status: ResumeParseDispatchStatus.pending,
        leaseExpiresAt: null,
        lastErrorCategory: 'internal_error',
      }),
    });
    expect(prisma.resumeParseExecution.updateMany).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.not.stringContaining('secret=hidden'),
    );
  });
});

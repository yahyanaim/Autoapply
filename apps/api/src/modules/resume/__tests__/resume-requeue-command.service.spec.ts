import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  ResumeParseExecutionStatus,
  ResumeParseFailureCategory,
  ResumeParseStatus,
  ResumeRequeueReason,
} from '@prisma/client';
import {
  ResumeRequeueCommandService,
  ResumeRequeuePersistenceConflict,
  ResumeRequeueReplay,
} from '../application/resume-requeue-command.service';

describe('ResumeRequeueCommandService', () => {
  const requestedAt = new Date('2026-09-25T10:00:00.000Z');
  const execution = {
    id: 'execution-1',
    requestedAt,
  };
  const eligibleResume = {
    id: 'resume-1',
    parseStatus: ResumeParseStatus.failed,
    user: { dataProcessingConsentAt: new Date('2026-09-01T00:00:00.000Z') },
    parseExecutions: [
      {
        id: 'execution-0',
        generation: 0,
        status: ResumeParseExecutionStatus.failed_requeueable,
        failureCategory: ResumeParseFailureCategory.provider_transient,
        executionBoundary: 'free',
      },
    ],
  };
  const transaction = {
    resume: { findUnique: jest.fn() },
    resumeParseExecution: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    resumeParseExecution: { findUnique: jest.fn() },
  };
  const service = new ResumeRequeueCommandService(prisma as never);
  const input = {
    resumeId: 'resume-1',
    actorUserId: 'admin-1',
    idempotencyKey: 'resume-requeue-request-0001',
    reason: ResumeRequeueReason.provider_recovered,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.resumeParseExecution.findUnique.mockResolvedValue(null);
    transaction.resume.findUnique.mockResolvedValue(eligibleResume);
    transaction.resumeParseExecution.create.mockResolvedValue(execution);
  });

  it('creates one bounded execution generation and durable dispatch intent', async () => {
    const result = await service.requestRequeueInTransaction(
      transaction as never,
      input,
    );

    expect(result).toEqual({
      value: {
        resumeId: 'resume-1',
        requeueRequestId: 'execution-1',
        status: 'requeue_requested',
        requestedAt,
      },
      before: {
        status: 'failed',
        failureCategory: 'provider_transient',
      },
      after: {
        status: 'requeue_requested',
        reason: 'provider_recovered',
      },
    });
    expect(transaction.resume.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          parseExecutions: expect.objectContaining({
            where: { generation: 0 },
            take: 1,
          }),
        }),
      }),
    );
    expect(transaction.resumeParseExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resumeId: 'resume-1',
        predecessorExecutionId: 'execution-0',
        generation: 1,
        origin: 'admin_requeue',
        executionBoundary: 'free',
        status: 'requeue_requested',
        maxAttempts: 3,
        queueName: 'resume-parse-free',
        queueJobId: 'resume-parse-free-resume-1-g1',
        requestedByUserId: 'admin-1',
        requeueReason: 'provider_recovered',
        idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        dispatch: { create: {} },
      }),
      select: { id: true, requestedAt: true },
    });
    expect(
      JSON.stringify(transaction.resumeParseExecution.create.mock.calls[0][0]),
    ).not.toContain(input.idempotencyKey);
    expect(transaction).not.toHaveProperty('queue');
  });

  it.each([
    ResumeParseFailureCategory.document_unreadable,
    ResumeParseFailureCategory.document_empty,
    ResumeParseFailureCategory.provider_response_invalid,
    ResumeParseFailureCategory.provider_configuration,
    ResumeParseFailureCategory.authorization,
    ResumeParseFailureCategory.entitlement_changed,
    ResumeParseFailureCategory.record_missing,
    ResumeParseFailureCategory.internal_unknown,
    ResumeParseFailureCategory.legacy_unclassified,
  ])('rejects the explicitly non-requeueable %s category', async (failureCategory) => {
    transaction.resume.findUnique.mockResolvedValue({
      ...eligibleResume,
      parseExecutions: [
        {
          ...eligibleResume.parseExecutions[0],
          status: ResumeParseExecutionStatus.failed_permanent,
          failureCategory,
        },
      ],
    });

    await expect(
      service.requestRequeueInTransaction(transaction as never, input),
    ).rejects.toEqual(
      new ConflictException('Resume processing failure is not requeueable'),
    );
    expect(transaction.resumeParseExecution.create).not.toHaveBeenCalled();
  });

  it('rejects requeue after data-processing consent is no longer present', async () => {
    transaction.resume.findUnique.mockResolvedValue({
      ...eligibleResume,
      user: { dataProcessingConsentAt: null },
    });
    await expect(
      service.requestRequeueInTransaction(transaction as never, input),
    ).rejects.toEqual(
      new ConflictException('Resume requeue is not available in its current state'),
    );
    expect(transaction.resumeParseExecution.create).not.toHaveBeenCalled();
  });

  it.each([
    ResumeParseStatus.pending,
    ResumeParseStatus.processing,
    ResumeParseStatus.ready,
  ])('rejects a %s resume before creating a generation', async (parseStatus) => {
    transaction.resume.findUnique.mockResolvedValue({
      ...eligibleResume,
      parseStatus,
    });
    await expect(
      service.requestRequeueInTransaction(transaction as never, input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.resumeParseExecution.create).not.toHaveBeenCalled();
  });

  it('rejects missing resumes with the safe existing not-found behavior', async () => {
    transaction.resume.findUnique.mockResolvedValue(null);
    await expect(
      service.requestRequeueInTransaction(transaction as never, input),
    ).rejects.toEqual(
      new NotFoundException('Resume processing failure not found'),
    );
  });

  it('allows only one Admin-created generation per resume', async () => {
    transaction.resume.findUnique.mockResolvedValue({
      ...eligibleResume,
      parseExecutions: [
        {
          ...eligibleResume.parseExecutions[0],
          generation: 1,
          failureCategory: ResumeParseFailureCategory.worker_crash,
        },
      ],
    });
    await expect(
      service.requestRequeueInTransaction(transaction as never, {
        ...input,
        reason: ResumeRequeueReason.worker_recovery,
      }),
    ).rejects.toEqual(new ConflictException('Resume requeue limit reached'));
  });

  it('requires an allow-listed reason matching the durable failure category', async () => {
    await expect(
      service.requestRequeueInTransaction(transaction as never, {
        ...input,
        reason: ResumeRequeueReason.storage_recovered,
      }),
    ).rejects.toEqual(
      new ConflictException('Resume requeue reason does not match the failure'),
    );
  });

  it('fails the transaction on an exact replay so proof and audit can roll back', async () => {
    transaction.resumeParseExecution.findUnique.mockResolvedValue({
      requestFingerprint: (service as any).fingerprint(input),
    });
    await expect(
      service.requestRequeueInTransaction(transaction as never, input),
    ).rejects.toBeInstanceOf(ResumeRequeueReplay);
    expect(transaction.resume.findUnique).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for a different logical request', async () => {
    transaction.resumeParseExecution.findUnique.mockResolvedValue({
      requestFingerprint: 'different-fingerprint',
    });
    await expect(
      service.requestRequeueInTransaction(transaction as never, input),
    ).rejects.toEqual(
      new ConflictException(
        'The Idempotency-Key was already used for another request',
      ),
    );
  });

  it('routes a successor created by a concurrent winner through durable conflict resolution', async () => {
    transaction.resumeParseExecution.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'execution-1' });

    await expect(
      service.requestRequeueInTransaction(transaction as never, input),
    ).rejects.toBeInstanceOf(ResumeRequeuePersistenceConflict);
    expect(transaction.resume.findUnique).not.toHaveBeenCalled();
    expect(transaction.resumeParseExecution.create).not.toHaveBeenCalled();
  });

  it('resolves a concurrent winner through durable uniqueness without re-evaluating its successor', async () => {
    transaction.resumeParseExecution.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.requestRequeueInTransaction(transaction as never, input),
    ).rejects.toBeInstanceOf(ResumeRequeuePersistenceConflict);

    prisma.resumeParseExecution.findUnique.mockResolvedValue({
      id: execution.id,
      resumeId: input.resumeId,
      requestedAt,
      requestFingerprint: (service as any).fingerprint(input),
    });
    await expect(service.resolveIdempotentResult(input)).resolves.toEqual({
      resumeId: input.resumeId,
      requeueRequestId: execution.id,
      status: 'requeue_requested',
      requestedAt,
    });
  });

  it('returns a safe conflict when a different idempotency key loses the successor race', async () => {
    transaction.resumeParseExecution.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.requestRequeueInTransaction(transaction as never, {
        ...input,
        idempotencyKey: 'different-requeue-request-0002',
      }),
    ).rejects.toBeInstanceOf(ResumeRequeuePersistenceConflict);

    prisma.resumeParseExecution.findUnique.mockResolvedValue(null);
    await expect(
      service.resolveIdempotentResult({
        ...input,
        idempotencyKey: 'different-requeue-request-0002',
      }),
    ).rejects.toEqual(new ConflictException('Resume requeue request conflicted'));
  });
});

import { ResumeRequeueReason, UserRole } from '@prisma/client';
import {
  ResumeRequeuePersistenceConflict,
  ResumeRequeueReplay,
} from '../../resume/application/resume-requeue-command.service';
import { AdminResumesService } from './admin-resumes.service';

describe('AdminResumesService', () => {
  const mutations = { execute: jest.fn() };
  const resumes = {
    requestRequeueInTransaction: jest.fn(),
    resolveIdempotentResult: jest.fn(),
  };
  const service = new AdminResumesService(mutations as never, resumes as never);
  const context = {
    actorUserId: 'admin-1',
    sessionId: 'session-1',
    role: UserRole.platform_admin,
    mfaVerified: true,
    correlationId: 'request_12345678',
  };
  const input = {
    context,
    resumeId: 'resume-1',
    reason: ResumeRequeueReason.provider_recovered,
    idempotencyKey: 'resume-requeue-request-0001',
    stepUpProof: 'raw-proof',
  };

  beforeEach(() => jest.clearAllMocks());

  it('binds the proof and passes the executor transaction to the Resume owner', async () => {
    const transaction = { resume: {}, resumeParseExecution: {} };
    resumes.requestRequeueInTransaction.mockResolvedValue({
      value: { resumeId: 'resume-1', status: 'requeue_requested' },
      before: { status: 'failed' },
      after: { status: 'requeue_requested' },
    });
    mutations.execute.mockImplementation(async (request) =>
      (await request.command(transaction)).value,
    );

    await expect(service.requeue(input)).resolves.toEqual({
      resumeId: 'resume-1',
      status: 'requeue_requested',
    });
    expect(mutations.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context,
        proof: 'raw-proof',
        action: 'admin.resume.requeue',
        targetType: 'resume',
        targetId: 'resume-1',
      }),
    );
    expect(resumes.requestRequeueInTransaction).toHaveBeenCalledWith(
      transaction,
      {
        resumeId: 'resume-1',
        actorUserId: 'admin-1',
        idempotencyKey: 'resume-requeue-request-0001',
        reason: ResumeRequeueReason.provider_recovered,
      },
    );
    expect(Reflect.getMetadata('design:paramtypes', AdminResumesService)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'PrismaService' })]),
    );
  });

  it.each([
    new ResumeRequeueReplay(),
    new ResumeRequeuePersistenceConflict(),
  ])('resolves a committed idempotent result after the executor rolls back', async (error) => {
    mutations.execute.mockRejectedValue(error);
    resumes.resolveIdempotentResult.mockResolvedValue({
      resumeId: 'resume-1',
      requeueRequestId: 'execution-1',
      status: 'requeue_requested',
    });

    await expect(service.requeue(input)).resolves.toEqual(
      expect.objectContaining({ requeueRequestId: 'execution-1' }),
    );
    expect(resumes.resolveIdempotentResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeId: 'resume-1',
        actorUserId: 'admin-1',
      }),
    );
  });

  it('does not swallow an unknown transaction failure', async () => {
    const error = new Error('database unavailable');
    mutations.execute.mockRejectedValue(error);
    await expect(service.requeue(input)).rejects.toBe(error);
    expect(resumes.resolveIdempotentResult).not.toHaveBeenCalled();
  });
});

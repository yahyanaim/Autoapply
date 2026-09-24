import { JobDeactivationReason, UserRole } from '@prisma/client';
import { AdminJobsService } from './admin-jobs.service';

describe('AdminJobsService', () => {
  const mutations = { execute: jest.fn() };
  const jobs = { deactivateInTransaction: jest.fn() };
  const service = new AdminJobsService(mutations as never, jobs as never);
  const context = {
    actorUserId: 'admin-1',
    sessionId: 'session-1',
    role: UserRole.platform_admin,
    mfaVerified: true,
    correlationId: 'request_12345678',
  };

  beforeEach(() => jest.clearAllMocks());

  it('binds one transaction-aware Jobs command to the approved proof action', async () => {
    const transaction = { job: {} };
    mutations.execute.mockImplementation(async (input) =>
      (await input.command(transaction)).value,
    );
    jobs.deactivateInTransaction.mockResolvedValue({
      value: { jobId: 'job-1', status: 'deactivated' },
      before: { status: 'active' },
      after: { status: 'deactivated' },
    });

    await service.deactivate({
      context,
      jobId: 'job-1',
      reason: JobDeactivationReason.invalid_listing,
      stepUpProof: 'raw-proof',
    });

    expect(mutations.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context,
        proof: 'raw-proof',
        action: 'admin.job.deactivate',
        targetType: 'job',
        targetId: 'job-1',
      }),
    );
    expect(jobs.deactivateInTransaction).toHaveBeenCalledWith(
      transaction,
      'admin-1',
      'job-1',
      JobDeactivationReason.invalid_listing,
    );
    expect(Reflect.getMetadata('design:paramtypes', AdminJobsService)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'PrismaService' })]),
    );
  });
});

import { AdminOperationsService } from './admin-operations.service';

describe('AdminOperationsService', () => {
  const jobs = { listForAdmin: jest.fn(), getForAdmin: jest.fn() };
  const resumes = { listFailures: jest.fn(), getFailure: jest.fn() };
  const beta = { getAdminSummary: jest.fn() };
  const notifications = { getDeliverySummary: jest.fn() };
  const applications = { getAggregate: jest.fn() };
  const service = new AdminOperationsService(jobs as never, resumes as never, beta as never, notifications as never, applications as never);

  beforeEach(() => jest.clearAllMocks());

  it('delegates every read exclusively to its owning module', async () => {
    jobs.listForAdmin.mockResolvedValue({ jobs: [] });
    jobs.getForAdmin.mockResolvedValue({ id: 'job' });
    resumes.listFailures.mockResolvedValue({ failures: [] });
    resumes.getFailure.mockResolvedValue({ resumeId: 'resume' });
    beta.getAdminSummary.mockResolvedValue({ registrationCount: 0 });
    notifications.getDeliverySummary.mockResolvedValue({ failures: [] });
    applications.getAggregate.mockResolvedValue({ total: 0 });
    await service.listJobs({ limit: 20 });
    await service.getJob('job');
    await service.listResumeFailures({ limit: 20 });
    await service.getResumeFailure('resume');
    await service.getBetaGate();
    await service.getNotifications({ limit: 20 });
    await service.getApplications({});
    expect(jobs.listForAdmin).toHaveBeenCalledWith({ limit: 20 });
    expect(resumes.listFailures).toHaveBeenCalledWith({ limit: 20 });
    expect(beta.getAdminSummary).toHaveBeenCalledTimes(1);
    expect(notifications.getDeliverySummary).toHaveBeenCalledWith({ limit: 20 });
    expect(applications.getAggregate).toHaveBeenCalledWith({});
    expect(Reflect.getMetadata('design:paramtypes', AdminOperationsService)).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'PrismaService' })]));
  });
});

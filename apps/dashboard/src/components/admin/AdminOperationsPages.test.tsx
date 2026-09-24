import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView, setFormValue } from '@/test/render';
import { AdminApplicationsPage, AdminBetaGatePage, AdminJobsPage, AdminNotificationsPage, AdminResumeFailuresPage } from './AdminOperationsPages';

const api = vi.hoisted(() => ({ jobs: vi.fn(), issueStepUp: vi.fn(), deactivateJob: vi.fn(), resumeFailures: vi.fn(), requeueResume: vi.fn(), betaGate: vi.fn(), notifications: vi.fn(), applications: vi.fn() }));
vi.mock('@/lib/api/admin-api-client', () => ({ adminApiClient: { adminConsole: api } }));

function view(node: ReactNode) {
  return renderView(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);
}
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }

describe('Phase 3 Admin operational pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.jobs.mockResolvedValue({ jobs: [{ id: 'job-1', title: 'Engineer', company: 'ApplyAI', source: 'greenhouse', location: 'Remote', remoteType: 'remote', status: 'active', lastObservedAt: '2026-09-24T00:00:00.000Z', eligible: true, createdAt: '2026-09-24T00:00:00.000Z' }], limit: 20, nextCursor: null });
    api.issueStepUp.mockResolvedValue({ proof: 'one-time-proof', expiresAt: '2026-09-24T00:05:00.000Z' });
    api.deactivateJob.mockResolvedValue({ jobId: 'job-1', status: 'deactivated', deactivatedAt: '2026-09-24T00:00:00.000Z', reason: 'invalid_listing' });
    api.resumeFailures.mockResolvedValue({ failures: [{ resumeId: 'resume-1', status: 'failed', failureCategory: 'provider_transient', requeueable: true, mimeType: 'application/pdf', executionCount: 2, lastAttempt: 2, lastAttemptAt: '2026-09-24T00:00:00.000Z', createdAt: '2026-09-23T00:00:00.000Z', failedAt: '2026-09-24T00:00:00.000Z' }], limit: 20, nextCursor: null });
    api.requeueResume.mockResolvedValue({ resumeId: 'resume-1', requeueRequestId: 'execution-1', status: 'requeue_requested', requestedAt: '2026-09-25T00:00:00.000Z' });
    api.betaGate.mockResolvedValue({ enabled: true, registrationCount: 40, capacity: 100, remainingSlots: 60, status: 'open', updatedAt: '2026-09-24T00:00:00.000Z' });
    api.notifications.mockResolvedValue({ period: { from: '2026-09-23T00:00:00.000Z', to: '2026-09-24T00:00:00.000Z' }, rollup: { total: 5, pending: 0, sent: 3, failed: 2, read: 0 }, failures: [{ id: 'failure-1', channel: 'email', status: 'failed', createdAt: '2026-09-24T00:00:00.000Z', sentAt: null }], limit: 20, nextCursor: null });
    api.applications.mockResolvedValue({ period: { from: '2026-08-24T00:00:00.000Z', to: '2026-09-24T00:00:00.000Z' }, total: 4, byStatus: { draft: 0, submitted: 4, viewed: 0, interview: 0, offer: 0, rejected: 0 } });
  });

  it('renders jobs and resume failures without sensitive content', async () => {
    const jobs = view(<AdminJobsPage />); await settle(); await settle();
    expect(jobs.container.textContent).toContain('Engineer');
    expect(jobs.container.textContent).toContain('Eligible');
    jobs.cleanup();
    const resumes = view(<AdminResumeFailuresPage />); await settle(); await settle();
    expect(resumes.container.textContent).toContain('resume-1');
    expect(resumes.container.textContent).not.toMatch(/resume text|parsedJson|originalFileUrl|prompt|token|secret|credential/i);
    resumes.cleanup();
  });

  it('issues a resume-bound proof and sends one allow-listed requeue request', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );
    const resumes = view(<AdminResumeFailuresPage />);
    await settle();
    await settle();
    const open = Array.from(resumes.container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Requeue',
    );
    if (!open) throw new Error('Expected Requeue button');
    click(open);
    setFormValue(
      resumes.required<HTMLInputElement>(
        '[aria-label="Resume requeue authenticator code"]',
      ),
      '123456',
    );
    const confirm = Array.from(resumes.container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Confirm requeue',
    );
    if (!confirm) throw new Error('Expected requeue confirmation button');
    click(confirm);
    await settle();
    await settle();

    expect(api.issueStepUp).toHaveBeenCalledWith({
      code: '123456',
      action: 'admin.resume.requeue',
      targetType: 'resume',
      targetId: 'resume-1',
    });
    expect(api.requeueResume).toHaveBeenCalledWith('resume-1', {
      reason: 'provider_recovered',
      stepUpProof: 'one-time-proof',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
    expect(resumes.container.textContent).not.toMatch(
      /one-time-proof|00000000-0000-4000-8000-000000000001/,
    );
    resumes.cleanup();
  });

  it('fails closed when an unapproved failure category is marked requeueable', async () => {
    api.resumeFailures.mockResolvedValueOnce({
      failures: [
        {
          resumeId: 'resume-legacy',
          status: 'failed',
          failureCategory: 'legacy_unclassified',
          requeueable: true,
          mimeType: 'application/pdf',
          executionCount: 1,
          lastAttempt: 1,
          lastAttemptAt: '2026-09-24T00:00:00.000Z',
          createdAt: '2026-09-23T00:00:00.000Z',
          failedAt: '2026-09-24T00:00:00.000Z',
        },
      ],
      limit: 20,
      nextCursor: null,
    });
    const resumes = view(<AdminResumeFailuresPage />);
    await settle();
    await settle();
    expect(resumes.container.textContent).toContain('Not requeueable');
    expect(
      Array.from(resumes.container.querySelectorAll('button')).some(
        (button) => button.textContent === 'Requeue',
      ),
    ).toBe(false);
    expect(api.issueStepUp).not.toHaveBeenCalled();
    expect(api.requeueResume).not.toHaveBeenCalled();
    resumes.cleanup();
  });

  it('confirms a bound step-up before deactivating and never renders proof data', async () => {
    const jobs = view(<AdminJobsPage />); await settle(); await settle();
    const deactivate = Array.from(jobs.container.querySelectorAll('button')).find((button) => button.textContent === 'Deactivate');
    if (!deactivate) throw new Error('Expected Deactivate button');
    click(deactivate);
    setFormValue(jobs.required<HTMLInputElement>('[aria-label="Authenticator code"]'), '123456');
    const confirm = Array.from(jobs.container.querySelectorAll('button')).find((button) => button.textContent === 'Confirm deactivation');
    if (!confirm) throw new Error('Expected confirmation button');
    click(confirm); await settle(); await settle();
    expect(api.issueStepUp).toHaveBeenCalledWith({ code: '123456', action: 'admin.job.deactivate', targetType: 'job', targetId: 'job-1' });
    expect(api.deactivateJob).toHaveBeenCalledWith('job-1', { reason: 'invalid_listing', stepUpProof: 'one-time-proof' });
    expect(jobs.container.textContent).not.toContain('one-time-proof');
    jobs.cleanup();
  });

  it('renders Beta, notification, and aggregate application operational summaries', async () => {
    const beta = view(<AdminBetaGatePage />); await settle(); await settle(); expect(beta.container.textContent).toContain('60'); beta.cleanup();
    const notifications = view(<AdminNotificationsPage />); await settle(); await settle(); expect(notifications.container.textContent).toContain('failure-1'); expect(notifications.container.textContent).not.toMatch(/message body|recipient|credential|token|secret/i); notifications.cleanup();
    const applications = view(<AdminApplicationsPage />); await settle(); await settle(); expect(applications.container.textContent).toContain('Aggregate Applications'); expect(applications.container.textContent).toContain('4'); expect(applications.container.textContent).not.toMatch(/email|user id|cv|prompt|nori|career chat|generated document/i); applications.cleanup();
  });

  it('shows loading and safe error retry states without calling mutation APIs', async () => {
    api.jobs.mockReturnValueOnce(new Promise(() => undefined));
    const loading = view(<AdminJobsPage />); expect(loading.required('[aria-label="Loading jobs"]')).toBeTruthy(); loading.cleanup();
    api.resumeFailures.mockRejectedValueOnce(new Error('safe failure'));
    const error = view(<AdminResumeFailuresPage />); await settle(); await settle(); expect(error.container.textContent).toContain('Could not load resume failures'); error.cleanup();
    expect(api.deactivateJob).not.toHaveBeenCalled();
  });

  it('renders empty and zero states and keeps raw cursors out of the UI', async () => {
    api.jobs.mockResolvedValueOnce({ jobs: [], limit: 20, nextCursor: null });
    const jobs = view(<AdminJobsPage />); await settle(); await settle(); expect(jobs.container.textContent).toContain('No jobs found'); jobs.cleanup();
    api.resumeFailures.mockResolvedValueOnce({ failures: [], limit: 20, nextCursor: 'opaque-secret-cursor' }).mockResolvedValueOnce({ failures: [], limit: 20, nextCursor: null });
    const resumes = view(<AdminResumeFailuresPage />); await settle(); await settle();
    expect(resumes.container.textContent).toContain('No resume failures');
    expect(resumes.container.textContent).not.toContain('opaque-secret-cursor');
    const next = Array.from(resumes.container.querySelectorAll('button')).find((button) => button.textContent === 'Next');
    if (!next) throw new Error('Expected Next button');
    click(next); await settle(); await settle();
    expect(api.resumeFailures).toHaveBeenLastCalledWith({ limit: 20, cursor: 'opaque-secret-cursor' });
    resumes.cleanup();
    api.betaGate.mockResolvedValueOnce({ enabled: false, registrationCount: 0, capacity: 100, remainingSlots: 100, status: 'disabled', updatedAt: '2026-09-24T00:00:00.000Z' });
    const beta = view(<AdminBetaGatePage />); await settle(); await settle(); expect(beta.container.textContent).toContain('Beta mode is disabled'); beta.cleanup();
    api.applications.mockResolvedValueOnce({ period: { from: '2026-08-24T00:00:00.000Z', to: '2026-09-24T00:00:00.000Z' }, total: 0, byStatus: { draft: 0, submitted: 0, viewed: 0, interview: 0, offer: 0, rejected: 0 } });
    const applications = view(<AdminApplicationsPage />); await settle(); await settle(); expect(applications.container.textContent).toContain('Total applications'); expect(applications.container.textContent).toContain('0'); applications.cleanup();
  });
});

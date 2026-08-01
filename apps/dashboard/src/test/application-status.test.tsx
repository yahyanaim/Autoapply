import { afterEach, describe, expect, it, vi } from 'vitest';
import ApplicationsPage from '@/app/(dashboard)/applications/page';
import type { Application } from '@/lib/api/hooks/use-applications';
import { flushUpdates, renderView, RenderedView, setFormValue } from './render';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

const application: Application = {
  id: 'application-1',
  userId: 'user-1',
  jobId: 'job-1',
  sourceResumeId: null,
  resumeVersionId: null,
  coverLetterId: null,
  status: 'submitted',
  preparationStatus: 'job_captured',
  jobAnalysis: null,
  generationError: null,
  approvedAt: null,
  appliedAt: '2026-07-28T10:00:00.000Z',
  timeline: [],
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-28T10:00:00.000Z',
  truthfulness: null,
  job: {
    id: 'job-1',
    source: 'integration',
    sourceUrl: 'https://example.com/jobs/1',
    title: 'Data Analyst',
    description: 'Analyze operational data',
    location: 'Casablanca',
    remoteType: 'hybrid',
    salaryMin: null,
    salaryMax: null,
    createdAt: '2026-07-20T10:00:00.000Z',
    company: { id: 'company-1', name: 'Atlas Data' },
    skills: [],
  },
};

vi.mock('@/lib/api/hooks/use-applications', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/api/hooks/use-applications')
  >('@/lib/api/hooks/use-applications');
  return {
    ...actual,
    useApplications: () => ({
      applications: {
        data: {
          applications: [application],
          total: 1,
          page: 1,
          limit: 100,
        },
        isLoading: false,
        isError: false,
        error: null,
      },
      update: {
        mutateAsync: mocks.update,
        isPending: false,
      },
    }),
    useApplicationUsage: () => ({
      data: {
        used: 1,
        maximum: 10,
        unlimited: false,
        resetAt: '2026-08-01T00:00:00.000Z',
      },
    }),
  };
});

let view: RenderedView | undefined;

afterEach(() => {
  view?.cleanup();
  view = undefined;
});

describe('ApplicationsPage', () => {
  it('offers only valid next statuses and persists the selected transition', async () => {
    mocks.update.mockResolvedValue({ ...application, status: 'interview' });
    view = renderView(<ApplicationsPage />);
    const select = view.required<HTMLSelectElement>(
      'select[aria-label="Update Data Analyst status"]',
    );

    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '',
      'viewed',
      'interview',
      'offer',
      'rejected',
    ]);

    setFormValue(select, 'interview');
    await flushUpdates();

    expect(mocks.update).toHaveBeenCalledWith({
      id: 'application-1',
      status: 'interview',
    });
  });

  it('surfaces a rejected status update to the user', async () => {
    mocks.update.mockRejectedValue(new Error('Invalid status transition'));
    view = renderView(<ApplicationsPage />);

    setFormValue(
      view.required<HTMLSelectElement>(
        'select[aria-label="Update Data Analyst status"]',
      ),
      'viewed',
    );
    await flushUpdates();

    expect(view.required<HTMLElement>('[role="alert"]').textContent).toContain(
      'Invalid status transition',
    );
  });
});

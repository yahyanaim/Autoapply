import { AshbyAdapter } from '../infrastructure/sources/ashby/ashby.adapter';
import { GreenhouseAdapter } from '../infrastructure/sources/greenhouse/greenhouse.adapter';
import { LeverAdapter } from '../infrastructure/sources/lever/lever.adapter';

describe('official job-source API adapters', () => {
  const jobService = { ingestJob: jest.fn() };
  const partnerApi = { fetch: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    jobService.ingestJob.mockResolvedValue({ id: 'job-1' });
  });

  it('reads Greenhouse descriptions from the documented content field', async () => {
    partnerApi.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        jobs: [
          {
            title: 'Backend Engineer',
            absolute_url: 'https://boards.greenhouse.io/acme/jobs/1',
            content: '&lt;p&gt;Build &amp;amp; operate APIs&lt;/p&gt;',
            location: { name: 'Remote' },
          },
        ],
      }),
    });
    const adapter = new GreenhouseAdapter(
      jobService as never,
      partnerApi as never,
    );

    await expect(adapter.fetchJobs('acme', 20)).resolves.toBe(1);
    expect(partnerApi.fetch).toHaveBeenCalledWith(
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true',
    );
    expect(jobService.ingestJob).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'greenhouse',
        description: 'Build & operate APIs',
      }),
    );
  });

  it('uses Ashby public Posting API and ignores unlisted jobs', async () => {
    partnerApi.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        apiVersion: '1',
        jobs: [
          {
            title: 'Product Manager',
            location: 'Casablanca',
            descriptionPlain: 'Lead product delivery.',
            jobUrl: 'https://jobs.ashbyhq.com/acme/listed',
            isListed: true,
          },
          {
            title: 'Private role',
            jobUrl: 'https://jobs.ashbyhq.com/acme/private',
            isListed: false,
          },
        ],
      }),
    });
    const adapter = new AshbyAdapter(
      jobService as never,
      partnerApi as never,
    );

    await expect(adapter.fetchJobs('acme', 20)).resolves.toBe(1);
    expect(partnerApi.fetch).toHaveBeenCalledWith(
      'https://api.ashbyhq.com/posting-api/job-board/acme',
      { headers: { Accept: 'application/json' } },
    );
    expect(jobService.ingestJob).toHaveBeenCalledTimes(1);
    expect(jobService.ingestJob).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ashby',
        sourceUrl: 'https://jobs.ashbyhq.com/acme/listed',
      }),
    );
  });

  it('asks Lever for bounded JSON results through its Postings API', async () => {
    partnerApi.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([
        {
          text: 'Frontend Engineer',
          hostedUrl: 'https://jobs.lever.co/acme/1',
          descriptionPlain: 'Build web products.',
          categories: { location: 'Hybrid' },
        },
      ]),
    });
    const adapter = new LeverAdapter(
      jobService as never,
      partnerApi as never,
    );

    await expect(adapter.fetchJobs('acme', 20)).resolves.toBe(1);
    expect(partnerApi.fetch).toHaveBeenCalledWith(
      'https://api.lever.co/v0/postings/acme?mode=json&limit=20',
      { headers: { Accept: 'application/json' } },
    );
  });
});

import { Injectable, Logger } from '@nestjs/common';
import { JobService } from '../../../application/job.service';
import { PartnerApiClient } from '../partner-api.client';

interface GreenhouseJob {
  title: string;
  url: string;
  description?: string;
  location?: string;
}

function parseJobs(payload: unknown): GreenhouseJob[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Greenhouse returned an invalid payload');
  }
  const jobs = (payload as Record<string, unknown>).jobs;
  if (!Array.isArray(jobs)) throw new Error('Greenhouse returned an invalid job list');
  return jobs.slice(0, 1_000).map((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Greenhouse returned an invalid job');
    }
    const job = value as Record<string, unknown>;
    const url =
      typeof job.absolute_url === 'string'
        ? job.absolute_url
        : typeof job.url === 'string'
          ? job.url
          : undefined;
    if (typeof job.title !== 'string' || !url) {
      throw new Error('Greenhouse returned a job without a title or URL');
    }
    const location =
      job.location && typeof job.location === 'object'
        ? (job.location as Record<string, unknown>).name
        : undefined;
    return {
      title: job.title,
      url,
      description: typeof job.description === 'string' ? job.description : undefined,
      location: typeof location === 'string' ? location : undefined,
    };
  });
}

@Injectable()
export class GreenhouseAdapter {
  private readonly logger = new Logger(GreenhouseAdapter.name);

  constructor(
    private readonly jobService: JobService,
    private readonly partnerApi: PartnerApiClient,
  ) {}

  async fetchJobs(boardToken: string): Promise<number> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
    try {
      const response = await this.partnerApi.fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const jobs = parseJobs((await response.json()) as unknown);

      for (const job of jobs) {
        await this.jobService.ingestJob({
          title: job.title,
          source: 'greenhouse',
          sourceUrl: job.url,
          description: job.description,
          location: job.location,
          companyName: boardToken,
        });
      }
      this.logger.log(
        `Ingested ${jobs.length} jobs from Greenhouse board ${boardToken}`,
      );
      return jobs.length;
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch Greenhouse jobs: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

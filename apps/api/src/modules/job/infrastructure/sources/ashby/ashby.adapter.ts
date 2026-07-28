import { Injectable, Logger } from '@nestjs/common';
import { JobService } from '../../../application/job.service';
import { PartnerApiClient } from '../partner-api.client';

interface AshbyPosting {
  title: string;
  descriptionPlain?: string;
  location?: string;
  jobUrl: string;
  isListed?: boolean;
}

function parsePostings(payload: unknown): AshbyPosting[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Ashby returned an invalid payload');
  }
  const postings = (payload as Record<string, unknown>).jobs;
  if (!Array.isArray(postings)) throw new Error('Ashby returned an invalid job list');
  return postings
    .slice(0, 1_000)
    .map((value) => {
      if (!value || typeof value !== 'object') {
        throw new Error('Ashby returned an invalid job');
      }
      const posting = value as Record<string, unknown>;
      if (
        typeof posting.title !== 'string' ||
        typeof posting.jobUrl !== 'string'
      ) {
        throw new Error('Ashby returned a job without a title or URL');
      }
      return {
        title: posting.title,
        jobUrl: posting.jobUrl,
        descriptionPlain:
          typeof posting.descriptionPlain === 'string'
            ? posting.descriptionPlain
            : undefined,
        location:
          typeof posting.location === 'string'
            ? posting.location
            : undefined,
        isListed:
          typeof posting.isListed === 'boolean'
            ? posting.isListed
            : undefined,
      };
    })
    .filter((posting) => posting.isListed !== false);
}

@Injectable()
export class AshbyAdapter {
  private readonly logger = new Logger(AshbyAdapter.name);

  constructor(
    private readonly jobService: JobService,
    private readonly partnerApi: PartnerApiClient,
  ) {}

  async fetchJobs(jobBoardName: string, limit = 1_000): Promise<number> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(jobBoardName)}`;
    try {
      const response = await this.partnerApi.fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const postings = parsePostings((await response.json()) as unknown).slice(
        0,
        Math.min(1_000, Math.max(1, limit)),
      );

      for (const posting of postings) {
        await this.jobService.ingestJob({
          title: posting.title,
          source: 'ashby',
          sourceUrl: posting.jobUrl,
          description: posting.descriptionPlain,
          location: posting.location,
          companyName: jobBoardName,
        });
      }
      this.logger.log(
        `Ingested ${postings.length} jobs from Ashby (${jobBoardName})`,
      );
      return postings.length;
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch Ashby jobs: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

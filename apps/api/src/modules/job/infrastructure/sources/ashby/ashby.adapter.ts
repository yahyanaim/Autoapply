import { Injectable, Logger } from '@nestjs/common';
import { JobService } from '../../../application/job.service';
import { PartnerApiClient } from '../partner-api.client';

interface AshbyPosting {
  id: string;
  title: string;
  descriptionPlain?: string;
  locationName?: string;
}

function parsePostings(payload: unknown): AshbyPosting[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Ashby returned an invalid payload');
  }
  const data = (payload as Record<string, unknown>).data;
  const board =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>).jobBoard
      : undefined;
  const postings =
    board && typeof board === 'object'
      ? (board as Record<string, unknown>).jobPostings
      : undefined;
  if (!Array.isArray(postings)) throw new Error('Ashby returned an invalid job list');
  return postings.slice(0, 1_000).map((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Ashby returned an invalid job');
    }
    const posting = value as Record<string, unknown>;
    if (typeof posting.id !== 'string' || typeof posting.title !== 'string') {
      throw new Error('Ashby returned a job without an ID or title');
    }
    return {
      id: posting.id,
      title: posting.title,
      descriptionPlain:
        typeof posting.descriptionPlain === 'string'
          ? posting.descriptionPlain
          : undefined,
      locationName:
        typeof posting.locationName === 'string'
          ? posting.locationName
          : undefined,
    };
  });
}

@Injectable()
export class AshbyAdapter {
  private readonly logger = new Logger(AshbyAdapter.name);

  constructor(
    private readonly jobService: JobService,
    private readonly partnerApi: PartnerApiClient,
  ) {}

  async fetchJobs(organizationId: string, limit = 1_000): Promise<number> {
    const url = `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`;
    try {
      const response = await this.partnerApi.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'ApiJobBoardWithTeams',
          variables: { organizationHostedJobsPageName: organizationId },
          query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title descriptionPlain locationName compensationTierSummary { visibleRange } } } }`,
        }),
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
          sourceUrl: `https://jobs.ashbyhq.com/${encodeURIComponent(organizationId)}/${encodeURIComponent(posting.id)}`,
          description: posting.descriptionPlain,
          location: posting.locationName,
          companyName: organizationId,
        });
      }
      this.logger.log(
        `Ingested ${postings.length} jobs from Ashby (${organizationId})`,
      );
      return postings.length;
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch Ashby jobs: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

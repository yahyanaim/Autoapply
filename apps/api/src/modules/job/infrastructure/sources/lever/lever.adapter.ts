import { Injectable, Logger } from '@nestjs/common';
import { JobService } from '../../../application/job.service';
import { PartnerApiClient } from '../partner-api.client';

interface LeverPosting {
  text: string;
  hostedUrl: string;
  descriptionPlain?: string;
  categories?: { location?: string };
}

function parsePostings(payload: unknown): LeverPosting[] {
  if (!Array.isArray(payload)) throw new Error('Lever returned an invalid payload');
  return payload.slice(0, 1_000).map((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Lever returned an invalid job');
    }
    const posting = value as Record<string, unknown>;
    if (typeof posting.text !== 'string' || typeof posting.hostedUrl !== 'string') {
      throw new Error('Lever returned a job without a title or URL');
    }
    const categories =
      posting.categories && typeof posting.categories === 'object'
        ? (posting.categories as Record<string, unknown>)
        : undefined;
    return {
      text: posting.text,
      hostedUrl: posting.hostedUrl,
      descriptionPlain:
        typeof posting.descriptionPlain === 'string'
          ? posting.descriptionPlain
          : undefined,
      categories: categories
        ? {
            location:
              typeof categories.location === 'string'
                ? categories.location
                : undefined,
          }
        : undefined,
    };
  });
}

@Injectable()
export class LeverAdapter {
  private readonly logger = new Logger(LeverAdapter.name);

  constructor(
    private readonly jobService: JobService,
    private readonly partnerApi: PartnerApiClient,
  ) {}

  async fetchJobs(company: string, limit = 1_000): Promise<number> {
    const boundedLimit = Math.min(1_000, Math.max(1, limit));
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json&limit=${boundedLimit}`;
    try {
      const response = await this.partnerApi.fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = parsePostings((await response.json()) as unknown).slice(
        0,
        boundedLimit,
      );

      for (const posting of data) {
        await this.jobService.ingestJob({
          title: posting.text,
          source: 'lever',
          sourceUrl: posting.hostedUrl,
          description: posting.descriptionPlain,
          location: posting.categories?.location,
          companyName: company,
        });
      }
      this.logger.log(`Ingested ${data.length} jobs from Lever (${company})`);
      return data.length;
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch Lever jobs: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

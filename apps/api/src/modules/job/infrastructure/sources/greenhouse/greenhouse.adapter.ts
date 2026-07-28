import { Injectable, Logger } from '@nestjs/common';
import { JobService } from '../../../application/job.service';
import { PartnerApiClient } from '../partner-api.client';

interface GreenhouseJob {
  title: string;
  url: string;
  content?: string;
  location?: string;
}

function toPlainText(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decoded.replace(
      /&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, code: string) => {
        const normalized = code.toLowerCase();
        if (normalized === 'amp') return '&';
        if (normalized === 'lt') return '<';
        if (normalized === 'gt') return '>';
        if (normalized === 'quot') return '"';
        if (normalized === 'apos') return "'";
        if (normalized === 'nbsp') return ' ';
        const numeric = normalized.startsWith('#x')
          ? Number.parseInt(normalized.slice(2), 16)
          : Number.parseInt(normalized.slice(1), 10);
        return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
          ? String.fromCodePoint(numeric)
          : entity;
      },
    );
  }
  return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
      content: typeof job.content === 'string' ? job.content : undefined,
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

  async fetchJobs(boardToken: string, limit = 1_000): Promise<number> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
    try {
      const response = await this.partnerApi.fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const jobs = parseJobs((await response.json()) as unknown).slice(
        0,
        Math.min(1_000, Math.max(1, limit)),
      );

      for (const job of jobs) {
        await this.jobService.ingestJob({
          title: job.title,
          source: 'greenhouse',
          sourceUrl: job.url,
          description: job.content ? toPlainText(job.content) : undefined,
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

import { Injectable } from '@nestjs/common';
import { AshbyAdapter } from '../infrastructure/sources/ashby/ashby.adapter';
import { GreenhouseAdapter } from '../infrastructure/sources/greenhouse/greenhouse.adapter';
import { LeverAdapter } from '../infrastructure/sources/lever/lever.adapter';

export type JobSource = 'greenhouse' | 'lever' | 'ashby';

@Injectable()
export class JobIngestionService {
  constructor(
    private readonly greenhouse: GreenhouseAdapter,
    private readonly lever: LeverAdapter,
    private readonly ashby: AshbyAdapter,
  ) {}

  async ingest(source: JobSource, identifier: string) {
    const count = source === 'greenhouse'
      ? await this.greenhouse.fetchJobs(identifier)
      : source === 'lever'
        ? await this.lever.fetchJobs(identifier)
        : await this.ashby.fetchJobs(identifier);
    return { source, identifier, ingested: count };
  }
}

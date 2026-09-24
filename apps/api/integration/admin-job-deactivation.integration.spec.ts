import { ConfigService } from '@nestjs/config';
import { JobDeactivationReason, JobStatus } from '@prisma/client';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { JobService } from '../src/modules/job/application/job.service';

const runId = `admin-job-deactivation-${process.pid}-${Date.now()}`;

describe('JobService administrative deactivation PostgreSQL concurrency', () => {
  let prisma: PrismaService;
  let jobs: JobService;
  let actorIds: string[];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'Integration tests require an isolated DATABASE_URL containing "test"',
      );
    }
    prisma = new PrismaService();
    await prisma.$connect();
    jobs = new JobService(
      prisma,
      { get: (_key: string, fallback: unknown) => fallback } as ConfigService,
    );
    const actors = await Promise.all([
      prisma.user.create({ data: { email: `${runId}-a@example.test` } }),
      prisma.user.create({ data: { email: `${runId}-b@example.test` } }),
    ]);
    actorIds = actors.map(({ id }) => id);
  });

  afterAll(async () => {
    await prisma?.job.deleteMany({ where: { source: runId } });
    await prisma?.user.deleteMany({
      where: { email: { startsWith: runId } },
    });
    await prisma?.$disconnect();
  });

  it('concurrently deactivates once and preserves the winning provenance', async () => {
    const job = await prisma.job.create({
      data: { title: 'Concurrent listing', source: runId },
    });

    const results = await Promise.all([
      prisma.$transaction((transaction) =>
        jobs.deactivateInTransaction(
          transaction,
          actorIds[0],
          job.id,
          JobDeactivationReason.invalid_listing,
        ),
      ),
      prisma.$transaction((transaction) =>
        jobs.deactivateInTransaction(
          transaction,
          actorIds[1],
          job.id,
          JobDeactivationReason.security_risk,
        ),
      ),
    ]);

    expect(results.every(({ value }) => value.status === JobStatus.deactivated)).toBe(
      true,
    );
    const stored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.status).toBe(JobStatus.deactivated);
    expect(actorIds).toContain(stored.deactivatedByUserId);
    expect([
      JobDeactivationReason.invalid_listing,
      JobDeactivationReason.security_risk,
    ]).toContain(stored.deactivationReason);
    expect(stored.deactivatedAt).not.toBeNull();
    expect(
      results.every(
        ({ value }) =>
          value.deactivatedAt.getTime() === stored.deactivatedAt?.getTime() &&
          value.reason === stored.deactivationReason,
      ),
    ).toBe(true);
  });

  it('keeps administrative state when provider ingestion refreshes the listing', async () => {
    const sourceUrl = `https://example.test/jobs/${runId}`;
    const sourceKey = `public:${sourceUrl}`;
    const job = await prisma.job.create({
      data: { title: 'Original title', source: runId, sourceUrl, sourceKey },
    });
    await prisma.$transaction((transaction) =>
      jobs.deactivateInTransaction(
        transaction,
        actorIds[0],
        job.id,
        JobDeactivationReason.provider_removed,
      ),
    );

    await jobs.ingestJob({
      title: 'Provider-refreshed title',
      source: runId,
      sourceUrl,
    });

    const refreshed = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(refreshed.title).toBe('Provider-refreshed title');
    expect(refreshed.status).toBe(JobStatus.deactivated);
    expect(refreshed.deactivatedByUserId).toBe(actorIds[0]);
    expect(refreshed.deactivationReason).toBe(
      JobDeactivationReason.provider_removed,
    );
  });
});

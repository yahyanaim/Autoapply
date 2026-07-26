import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import {
  ResumeParseDeadLetterQueueToken,
  ResumeParseQueueToken,
} from '../src/modules/resume/application/resume.service';
import type { Queue } from 'bullmq';

describe('API integration: authentication and tenant isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marker = `integration-${Date.now()}`;
  const emails = [`a-${marker}@example.com`, `b-${marker}@example.com`];
  let jobId: string;
  let ownerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'Integration tests require an isolated DATABASE_URL containing "test"',
      );
    }
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const job = await prisma.job.create({
      data: {
        source: 'integration-test',
        sourceUrl: `https://example.com/jobs/${marker}`,
        title: 'Integration Engineer',
        description: 'TypeScript PostgreSQL',
      },
    });
    jobId = job.id;
    ownerToken = await register(emails[0]);
    otherToken = await register(emails[1]);
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { in: emails } } });
    if (jobId) await prisma?.job.deleteMany({ where: { id: jobId } });
    await app?.close();
  });

  async function register(email: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'IntegrationPass123!@',
        acceptDataProcessing: true,
      })
      .expect(201);
    expect(response.body.refreshToken).toBeUndefined();
    return response.body.accessToken as string;
  }

  it('does not reveal another tenant application', async () => {
    const created = await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ jobId })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(created.body.id);
      });
  });

  it('retries a queue job, marks the record failed, and retains a DLQ entry', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: emails[0] },
    });
    const resume = await prisma.resume.create({
      data: {
        userId: user.id,
        originalFileUrl: `/uploads/resumes/missing-${marker}.pdf`,
        fileName: 'missing.pdf',
        fileSize: 100,
        mimeType: 'application/pdf',
      },
    });
    const queue = app.get<Queue>(ResumeParseQueueToken);
    const deadLetterQueue = app.get<Queue>(ResumeParseDeadLetterQueueToken);
    const queueJobId = `integration-resume-parse-${resume.id}`;
    await queue.add(
      'parse-resume',
      { resumeId: resume.id, userId: user.id },
      {
        jobId: queueJobId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10 },
        removeOnFail: false,
      },
    );

    await waitFor(async () => {
      const failed = await queue.getJob(queueJobId);
      return (await failed?.getState()) === 'failed';
    });
    const deadLetter = await waitFor(async () =>
      deadLetterQueue.getJob(`resume-parse-dlq-${queueJobId}`),
    );
    const updated = await prisma.resume.findUniqueOrThrow({
      where: { id: resume.id },
    });
    const activityCount = await prisma.activityLog.count({
      where: {
        userId: user.id,
        type: 'queue_job',
        metadata: { path: ['resumeId'], equals: resume.id },
      },
    });

    expect(updated.parseStatus).toBe('failed');
    expect(deadLetter?.data).toEqual(
      expect.objectContaining({
        originalJobId: queueJobId,
        attemptsMade: 2,
      }),
    );
    expect(activityCount).toBeGreaterThanOrEqual(2);
    await (await queue.getJob(queueJobId))?.remove();
    await deadLetter?.remove();
  });
});

async function waitFor<T>(
  operation: () => Promise<T>,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await operation();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for integration state');
}

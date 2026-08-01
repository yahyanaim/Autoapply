import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ApplicationStatus,
  ResumeParseStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import request from 'supertest';
import type Stripe from 'stripe';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { MatchScoreCacheService } from '../src/modules/ai/application/match-score-cache.service';
import { BillingService } from '../src/modules/billing/application/billing.service';

describe('API integration: workflow quotas and ownership', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marker = `workflow-integration-${Date.now()}`;
  const ownerEmail = `owner-${marker}@example.com`;
  const otherEmail = `other-${marker}@example.com`;
  const disposableEmail = `privacy-${marker}@example.com`;
  const emails = [ownerEmail, otherEmail, disposableEmail];
  const stripeEventIds: string[] = [];
  let ownerId: string;
  let otherId: string;
  let ownerToken: string;
  let otherToken: string;
  let publicJobId: string;

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

    ownerToken = await register(ownerEmail);
    otherToken = await register(otherEmail);
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    ownerId = users.find((user) => user.email === ownerEmail)?.id ?? '';
    otherId = users.find((user) => user.email === otherEmail)?.id ?? '';
    if (!ownerId || !otherId)
      throw new Error('Integration users were not created');

    const publicJob = await prisma.job.create({
      data: {
        source: 'integration-test',
        sourceUrl: `https://example.com/jobs/${marker}`,
        sourceKey: `public:${marker}`,
        title: 'Workflow Integration Specialist',
        description: 'Workflow testing and quality assurance',
      },
    });
    publicJobId = publicJob.id;
  });

  afterAll(async () => {
    await prisma?.stripeWebhookEvent.deleteMany({
      where: { eventId: { in: stripeEventIds } },
    });
    await prisma?.user.deleteMany({ where: { email: { in: emails } } });
    if (publicJobId) {
      await prisma?.job.deleteMany({ where: { id: publicJobId } });
    }
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
    return response.body.accessToken as string;
  }

  it('provisions the exact Free subscription and usage limits', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      include: { subscription: true, usageLimit: true },
    });

    expect(user.subscription).toEqual(
      expect.objectContaining({
        plan: 'free',
        status: 'active',
      }),
    );
    expect(user.usageLimit).toEqual(
      expect.objectContaining({
        applicationsUsed: 0,
        applicationsMax: 10,
        aiRequestsUsed: 0,
        aiRequestsMax: 5,
        resumeOptimizationsUsed: 0,
        resumeOptimizationsMax: 1,
        jobDiscoveriesUsed: 0,
        jobDiscoveriesMax: 3,
        resumesUsed: 0,
        resumesMax: 1,
        storageBytesUsed: 0,
        storageBytesMax: 5 * 1024 * 1024,
      }),
    );

    await request(app.getHttpServer())
      .get('/applications/usage')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            used: 0,
            maximum: 10,
            unlimited: false,
          }),
        );
      });
  });

  it('atomically prevents concurrent application requests from exceeding quota', async () => {
    await prisma.application.deleteMany({ where: { userId: ownerId } });
    await prisma.usageLimit.update({
      where: { userId: ownerId },
      data: { applicationsUsed: 0, applicationsMax: 1 },
    });

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Idempotency-Key', `${marker}:quota-first`)
        .send({ jobId: publicJobId }),
      request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Idempotency-Key', `${marker}:quota-second`)
        .send({ jobId: publicJobId }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 403,
    ]);
    await expect(
      prisma.application.count({
        where: { userId: ownerId, jobId: publicJobId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.usageLimit.findUniqueOrThrow({
        where: { userId: ownerId },
        select: { applicationsUsed: true },
      }),
    ).resolves.toEqual({ applicationsUsed: 1 });
  });

  it('returns the same application for a retried idempotent request', async () => {
    await prisma.application.deleteMany({ where: { userId: ownerId } });
    await prisma.usageLimit.update({
      where: { userId: ownerId },
      data: { applicationsUsed: 0, applicationsMax: 10 },
    });
    const idempotencyKey = `${marker}:same-create-retry`;

    const first = await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ jobId: publicJobId })
      .expect(201);
    const retried = await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ jobId: publicJobId })
      .expect(201);

    expect(retried.body.id).toBe(first.body.id);
    await expect(
      prisma.application.count({
        where: { userId: ownerId, jobId: publicJobId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.usageLimit.findUniqueOrThrow({
        where: { userId: ownerId },
        select: { applicationsUsed: true },
      }),
    ).resolves.toEqual({ applicationsUsed: 1 });
  });

  it('rejects another tenant materials without consuming application quota', async () => {
    const resume = await prisma.resume.create({
      data: {
        userId: otherId,
        originalFileUrl: `/uploads/resumes/${marker}.pdf`,
        parsedJson: {
          skills: ['Quality assurance'],
          experience: [],
          education: [],
          projects: [],
          languages: [],
          certifications: [],
        },
        parseStatus: ResumeParseStatus.ready,
      },
    });
    const resumeVersion = await prisma.resumeVersion.create({
      data: {
        resumeId: resume.id,
        jobId: publicJobId,
        optimizedText: 'Verified test resume',
        missingKeywords: [],
        weakSections: [],
      },
    });
    const coverLetter = await prisma.coverLetter.create({
      data: {
        userId: otherId,
        jobId: publicJobId,
        resumeVersionId: resumeVersion.id,
        content: 'Private cover letter',
      },
    });
    await prisma.usageLimit.update({
      where: { userId: ownerId },
      data: { applicationsUsed: 0, applicationsMax: 10 },
    });

    await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `${marker}:foreign-resume`)
      .send({
        jobId: publicJobId,
        resumeVersionId: resumeVersion.id,
      })
      .expect(404);
    await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `${marker}:foreign-letter`)
      .send({
        jobId: publicJobId,
        coverLetterId: coverLetter.id,
      })
      .expect(404);

    await expect(
      prisma.usageLimit.findUniqueOrThrow({
        where: { userId: ownerId },
        select: { applicationsUsed: true },
      }),
    ).resolves.toEqual({ applicationsUsed: 0 });
  });

  it('keeps user-captured jobs private to their owner', async () => {
    const privateJob = await prisma.job.create({
      data: {
        source: 'integration-test',
        sourceUrl: `https://example.com/private-jobs/${marker}`,
        sourceKey: `${otherId}:${marker}`,
        capturedByUserId: otherId,
        title: 'Private Captured Opportunity',
      },
    });

    await request(app.getHttpServer())
      .get(`/jobs/${privateJob.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/jobs/${privateJob.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(privateJob.id);
      });
  });

  it('persists only valid application transitions and their timeline', async () => {
    await prisma.application.deleteMany({ where: { userId: ownerId } });
    await prisma.usageLimit.update({
      where: { userId: ownerId },
      data: { applicationsUsed: 0, applicationsMax: 10 },
    });

    const created = await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `${marker}:status-flow`)
      .send({ jobId: publicJobId })
      .expect(201);

    const submitted = await request(app.getHttpServer())
      .patch(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: ApplicationStatus.submitted })
      .expect(200);
    expect(submitted.body.status).toBe(ApplicationStatus.submitted);
    expect(submitted.body.appliedAt).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: ApplicationStatus.interview })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: ApplicationStatus.viewed })
      .expect(400);

    const persisted = await prisma.application.findUniqueOrThrow({
      where: { id: created.body.id },
      select: { status: true, appliedAt: true, timeline: true },
    });
    expect(persisted.status).toBe(ApplicationStatus.interview);
    expect(persisted.appliedAt).toBeInstanceOf(Date);
    expect(persisted.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: ApplicationStatus.draft }),
        expect.objectContaining({ status: ApplicationStatus.submitted }),
        expect.objectContaining({ status: ApplicationStatus.interview }),
      ]),
    );
  });

  it('reuses an identical match score and invalidates it when CV evidence changes', async () => {
    const resume = await prisma.resume.create({
      data: {
        userId: ownerId,
        originalFileUrl: `/uploads/resumes/cache-${marker}.pdf`,
        parsedJson: {
          skills: ['SQL'],
          experience: [],
          education: [],
          projects: [],
          languages: ['French'],
          certifications: [],
        },
        parseStatus: ResumeParseStatus.ready,
      },
    });
    const cache = app.get(MatchScoreCacheService);
    const jobDescription =
      'Data analyst role requiring SQL, Tableau, and French reporting.';

    const first = await cache.score(
      resume.id,
      'Data analyst with SQL and French reporting experience.',
      jobDescription,
    );
    const repeated = await cache.score(
      resume.id,
      'Data analyst with SQL and French reporting experience.',
      jobDescription,
    );
    const changed = await cache.score(
      resume.id,
      'Data analyst with SQL, Tableau, and French reporting experience.',
      jobDescription,
    );

    expect(first.cached).toBe(false);
    expect(repeated).toEqual(expect.objectContaining({ cached: true }));
    expect(changed.cached).toBe(false);
    await expect(
      prisma.matchScoreCache.count({ where: { resumeId: resume.id } }),
    ).resolves.toBe(2);
  });

  it('processes the same Stripe webhook event only once', async () => {
    const eventId = `evt_${marker}`;
    stripeEventIds.push(eventId);
    const stripeSubscriptionId = `sub_${marker}`;
    await prisma.subscription.update({
      where: { userId: ownerId },
      data: {
        stripeSubscriptionId,
        plan: SubscriptionPlan.pro,
        status: SubscriptionStatus.active,
      },
    });
    const event = {
      id: eventId,
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: stripeSubscriptionId,
          object: 'subscription',
          status: 'canceled',
        },
      },
    } as unknown as Stripe.Event;
    const billing = app.get(BillingService);

    await expect(billing.handleWebhook(event)).resolves.toEqual({
      received: true,
    });
    await expect(billing.handleWebhook(event)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    await expect(
      prisma.stripeWebhookEvent.count({ where: { eventId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.subscription.findUniqueOrThrow({
        where: { userId: ownerId },
        select: { plan: true, status: true },
      }),
    ).resolves.toEqual({
      plan: SubscriptionPlan.free,
      status: SubscriptionStatus.canceled,
    });
  });

  it('exports selected personal data and permanently deletes the account', async () => {
    const token = await register(disposableEmail);
    const disposable = await prisma.user.findUniqueOrThrow({
      where: { email: disposableEmail },
      select: { id: true },
    });

    const exported = await request(app.getHttpServer())
      .get('/users/me/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Disposition', /applyai-data-export\.json/);

    expect(exported.body).toEqual(
      expect.objectContaining({
        formatVersion: '1.0',
        account: expect.objectContaining({
          id: disposable.id,
          email: disposableEmail,
        }),
      }),
    );
    expect(exported.body.account).not.toHaveProperty('passwordHash');
    expect(exported.body.account).not.toHaveProperty('mfaSecretEncrypted');

    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmation: 'DELETE MY ACCOUNT' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).toBe('Account and personal data deleted');
      });

    await expect(
      prisma.user.findUnique({ where: { id: disposable.id } }),
    ).resolves.toBeNull();
  });
});

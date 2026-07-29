import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ResumeParseStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

describe('API integration: workflow quotas and ownership', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marker = `workflow-integration-${Date.now()}`;
  const ownerEmail = `owner-${marker}@example.com`;
  const otherEmail = `other-${marker}@example.com`;
  const emails = [ownerEmail, otherEmail];
  let ownerId: string;
  let otherId: string;
  let ownerToken: string;
  let otherToken: string;
  let publicJobId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error('Integration tests require an isolated DATABASE_URL containing "test"');
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
    if (!ownerId || !otherId) throw new Error('Integration users were not created');

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
        .send({ jobId: publicJobId }),
      request(app.getHttpServer())
        .post('/applications')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ jobId: publicJobId }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 403]);
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
      .send({
        jobId: publicJobId,
        resumeVersionId: resumeVersion.id,
      })
      .expect(404);
    await request(app.getHttpServer())
      .post('/applications')
      .set('Authorization', `Bearer ${ownerToken}`)
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
});

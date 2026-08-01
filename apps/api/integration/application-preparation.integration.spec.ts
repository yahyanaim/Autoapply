import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Prisma,
  ResumeParseStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { AIService } from '../src/modules/ai/application/ai.service';
import type { JobAnalysis } from '../src/modules/ai/domain/job-analysis';
import type { GeneratedResumeDocument } from '../src/modules/resume/domain/generated-resume';

describe('API integration: complete application preparation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marker = `prepare-integration-${Date.now()}`;
  const email = `${marker}@example.com`;
  let accessToken: string;
  let userId: string;
  let resumeId: string;
  let jobId: string;

  const analysis: JobAnalysis = {
    summary: 'Build transparent data products.',
    responsibilities: ['Build operational dashboards'],
    requiredSkills: ['SQL', 'Power BI'],
    preferredSkills: [],
    experienceLevel: 'mid-level',
    education: [],
    languages: ['French'],
    keywords: ['SQL', 'Power BI', 'dashboards'],
  };
  const ai = {
    analyzeJob: jest.fn().mockResolvedValue(analysis),
    optimizeResume: jest.fn(),
    generateCoverLetter: jest.fn(),
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'Integration tests require an isolated DATABASE_URL containing "test"',
      );
    }
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AIService)
      .useValue(ai)
      .compile();
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

    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'IntegrationPass123!@',
        acceptDataProcessing: true,
      })
      .expect(201);
    accessToken = registration.body.accessToken as string;
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userId = user.id;
    await prisma.subscription.update({
      where: { userId },
      data: {
        plan: SubscriptionPlan.pro,
        status: SubscriptionStatus.active,
      },
    });
    const parsedResume = {
      skills: ['SQL', 'Power BI'],
      experience: [
        {
          title: 'Data Analyst',
          company: 'Atlas Data',
          startDate: '2023',
          endDate: 'Present',
          description: 'Built operational dashboards.',
          highlights: ['Automated data-quality checks'],
        },
      ],
      education: [],
      projects: [],
      languages: ['French'],
      certifications: [],
    };
    const resume = await prisma.resume.create({
      data: {
        userId,
        originalFileUrl: `/uploads/resumes/${marker}.pdf`,
        fileName: 'candidate.pdf',
        mimeType: 'application/pdf',
        fileSize: 2_048,
        parseStatus: ResumeParseStatus.ready,
        parsedJson: parsedResume,
      },
    });
    resumeId = resume.id;
    const job = await prisma.job.create({
      data: {
        source: 'integration-test',
        sourceKey: marker,
        sourceUrl: `https://example.com/jobs/${marker}`,
        title: 'Data Analyst',
        description: 'Build SQL and Power BI operational dashboards.',
      },
    });
    jobId = job.id;

    ai.optimizeResume.mockImplementation(
      async (
        _userId: string,
        requestedResumeId: string,
        requestedJobId: string,
      ) => {
        const document: GeneratedResumeDocument = {
          template: 'classic-ats-v1',
          contact: {
            fullName: 'Candidate',
            email,
          },
          profile: 'Data Analyst experienced in SQL and Power BI.',
          experience: parsedResume.experience,
          education: [],
          skills: parsedResume.skills,
          projects: [],
          certifications: [],
          languages: parsedResume.languages,
        };
        const version = await prisma.resumeVersion.create({
          data: {
            resumeId: requestedResumeId,
            jobId: requestedJobId,
            optimizedText: 'Data Analyst experienced in SQL and Power BI.',
            documentJson: document as unknown as Prisma.InputJsonValue,
            matchScore: 91,
            missingKeywords: [],
            weakSections: [],
          },
        });
        return { versionId: version.id };
      },
    );
    ai.generateCoverLetter.mockImplementation(
      async (
        requestedUserId: string,
        requestedJobId: string,
        _requestedResumeId: string,
        tone: string,
        resumeVersionId: string,
      ) =>
        prisma.coverLetter.create({
          data: {
            userId: requestedUserId,
            jobId: requestedJobId,
            resumeVersionId,
            tone,
            content:
              'Dear hiring team, my verified SQL and Power BI experience aligns with this role.',
          },
        }),
    );
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email } });
    if (jobId) await prisma?.job.deleteMany({ where: { id: jobId } });
    await app?.close();
  });

  it('persists one CV, cover letter, application, and quota charge across a retry', async () => {
    const idempotencyKey = `${marker}:complete-workflow`;
    const send = () =>
      request(app.getHttpServer())
        .post('/applications/prepare')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ jobId, resumeId });

    const first = await send().expect(201);
    const retry = await send().expect(201);

    expect(first.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        preparationStatus: 'ready_for_review',
        sourceResumeId: resumeId,
        resumeVersionId: expect.any(String),
        coverLetterId: expect.any(String),
        jobAnalysis: expect.objectContaining({
          requiredSkills: ['SQL', 'Power BI'],
        }),
      }),
    );
    expect(retry.body.id).toBe(first.body.id);
    expect(ai.analyzeJob).toHaveBeenCalledTimes(1);
    expect(ai.optimizeResume).toHaveBeenCalledTimes(1);
    expect(ai.generateCoverLetter).toHaveBeenCalledTimes(1);
    await expect(
      prisma.application.count({ where: { userId, jobId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.resumeVersion.count({ where: { resumeId, jobId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.coverLetter.count({ where: { userId, jobId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.usageLimit.findUniqueOrThrow({
        where: { userId },
        select: { applicationsUsed: true },
      }),
    ).resolves.toEqual({ applicationsUsed: 1 });
  });
});

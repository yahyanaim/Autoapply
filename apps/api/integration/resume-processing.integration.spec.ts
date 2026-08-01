import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ResumeParseStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import {
  ResumeParseQueueToken,
  StorageToken,
} from '../src/modules/resume/application/resume.service';
import {
  ParsedResume,
  ResumeParser,
} from '../src/modules/resume/infrastructure/parsers/resume-parser';
import { PdfParser } from '../src/modules/resume/infrastructure/parsers/pdf.parser';

describe('API integration: successful resume processing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queue: Queue;
  const marker = `resume-processing-${Date.now()}`;
  const email = `${marker}@example.com`;
  const parser = {
    parse: jest.fn<Promise<ParsedResume>, [string, string]>(),
  };
  const storage = {
    uploadFile: jest.fn(),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('%PDF-mocked')),
    deleteFile: jest.fn(),
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'Integration tests require an isolated DATABASE_URL containing "test"',
      );
    }
    parser.parse.mockResolvedValue({
      skills: ['SQL', 'Power BI'],
      experience: [
        {
          title: 'Data Analyst',
          company: 'Atlas Data',
          startDate: '2023',
          endDate: 'Present',
          description: 'Built operational dashboards',
          highlights: ['Automated data-quality checks'],
        },
      ],
      education: [],
      projects: [],
      languages: ['French', 'English'],
      certifications: [],
    });
    jest
      .spyOn(PdfParser, 'extractText')
      .mockResolvedValue('Sara Amrani SQL Power BI operational reporting');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageToken)
      .useValue(storage)
      .overrideProvider(ResumeParser)
      .useValue(parser)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    queue = app.get<Queue>(ResumeParseQueueToken);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'IntegrationPass123!@',
        acceptDataProcessing: true,
      })
      .expect(201);
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email } });
    await app?.close();
    jest.restoreAllMocks();
  });

  it('runs the Redis worker and persists parsed CV data in PostgreSQL', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const resume = await prisma.resume.create({
      data: {
        userId: user.id,
        originalFileUrl: `/uploads/resumes/${marker}.pdf`,
        fileName: 'sara-amrani.pdf',
        fileSize: 2_048,
        mimeType: 'application/pdf',
      },
    });
    const queueJobId = `integration-success-${resume.id}`;

    await queue.add(
      'parse-resume',
      { resumeId: resume.id, userId: user.id },
      {
        jobId: queueJobId,
        attempts: 1,
        removeOnComplete: false,
      },
    );

    const persisted = await waitFor(async () => {
      const current = await prisma.resume.findUnique({
        where: { id: resume.id },
      });
      return current?.parseStatus === ResumeParseStatus.ready
        ? current
        : undefined;
    });
    const completedActivity = await prisma.activityLog.findFirst({
      where: {
        userId: user.id,
        type: 'queue_job',
        metadata: {
          path: ['event'],
          equals: 'resume_parse_completed',
        },
      },
    });

    expect(parser.parse).toHaveBeenCalledWith(
      'Sara Amrani SQL Power BI operational reporting',
      user.id,
    );
    expect(persisted.parsedJson).toEqual(
      expect.objectContaining({
        skills: ['SQL', 'Power BI'],
        languages: ['French', 'English'],
      }),
    );
    expect(persisted.parseError).toBeNull();
    expect(completedActivity).not.toBeNull();
    await (await queue.getJob(queueJobId))?.remove();
  });
});

async function waitFor<T>(
  operation: () => Promise<T | undefined>,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await operation();
    if (result !== undefined) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for integration state');
}

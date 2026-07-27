import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResumeParseStatus } from '@prisma/client';
import {
  JobDiscoveryService,
  parseConfiguredSources,
} from '../application/job-discovery.service';

describe('JobDiscoveryService', () => {
  let prisma: any;
  let ingestion: any;
  let config: any;
  let service: JobDiscoveryService;

  beforeEach(() => {
    prisma = {
      resume: { findFirst: jest.fn() },
      job: { findMany: jest.fn() },
    };
    ingestion = { ingest: jest.fn() };
    config = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };
    service = new JobDiscoveryService(
      prisma,
      ingestion,
      config as ConfigService,
    );
  });

  it('ranks jobs against the selected ready resume and returns at most 20', async () => {
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume-1',
      parseStatus: ResumeParseStatus.ready,
      parsedJson: {
        skills: ['React', 'TypeScript', 'REST'],
        experience: [{ title: 'Frontend Engineer' }],
      },
    });
    prisma.job.findMany.mockResolvedValue(
      Array.from({ length: 24 }, (_, index) => ({
        id: `job-${index}`,
        source: 'greenhouse',
        sourceUrl: `https://example.com/jobs/${index}`,
        title:
          index === 0
            ? 'Frontend Engineer'
            : index === 1
              ? 'Registered Nurse'
              : 'Software Engineer',
        description:
          index === 1
            ? 'Provide nursing and clinical patient care.'
            : 'Build React and TypeScript software using REST APIs.',
        location: 'Casablanca',
        remoteType: null,
        salaryMin: null,
        salaryMax: null,
        scrapedAt: new Date(),
        createdAt: new Date(),
        company: { id: `company-${index}`, name: 'Example' },
        skills: [],
        applications: [],
      })),
    );

    const result = await service.discover('user-1', {
      resumeId: 'resume-1',
      limit: 20,
    });

    expect(result.jobs).toHaveLength(20);
    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        id: 'job-0',
        matchScore: expect.any(Number),
        matchedResumeSkills: expect.arrayContaining(['React', 'TypeScript']),
        missingKeywords: expect.any(Array),
        explanation: expect.arrayContaining([
          expect.stringMatching(/^Role-title alignment:/),
        ]),
      }),
    );
    expect(
      result.jobs.find((job) => job.id === 'job-1')?.matchScore ?? 0,
    ).toBeLessThan(result.jobs[0]!.matchScore);
    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: {
          AND: expect.arrayContaining([
            {
              OR: [
                { capturedByUserId: null },
                { capturedByUserId: 'user-1' },
              ],
            },
          ]),
        },
      }),
    );
  });

  it('refreshes only configured approved ATS sources', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'JOB_DISCOVERY_SOURCES') {
        return 'greenhouse:acme,lever:example,unknown:ignored';
      }
      return fallback;
    });
    ingestion.ingest
      .mockResolvedValueOnce({
        source: 'greenhouse',
        identifier: 'acme',
        ingested: 12,
      })
      .mockResolvedValueOnce({
        source: 'lever',
        identifier: 'example',
        ingested: 8,
      });
    prisma.resume.findFirst.mockResolvedValue({
      id: 'resume-1',
      parseStatus: ResumeParseStatus.ready,
      parsedJson: { skills: [], experience: [] },
    });
    prisma.job.findMany.mockResolvedValue([]);

    const result = await service.discover('user-1', {
      resumeId: 'resume-1',
      limit: 20,
    });

    expect(ingestion.ingest).toHaveBeenCalledTimes(2);
    expect(ingestion.ingest).toHaveBeenNthCalledWith(
      1,
      'greenhouse',
      'acme',
      250,
    );
    expect(ingestion.ingest).toHaveBeenNthCalledWith(
      2,
      'lever',
      'example',
      250,
    );
    expect(result.sourceRefresh).toEqual([
      expect.objectContaining({ status: 'refreshed', ingested: 12 }),
      expect.objectContaining({ status: 'refreshed', ingested: 8 }),
    ]);
  });

  it('rejects a resume that is missing or has not finished parsing', async () => {
    prisma.resume.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.discover('user-1', { resumeId: 'missing', limit: 20 }),
    ).rejects.toThrow(NotFoundException);

    prisma.resume.findFirst.mockResolvedValueOnce({
      id: 'resume-1',
      parseStatus: ResumeParseStatus.processing,
      parsedJson: null,
    });
    await expect(
      service.discover('user-1', { resumeId: 'resume-1', limit: 20 }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('parseConfiguredSources', () => {
  it('accepts only supported, unique, bounded source identifiers', () => {
    expect(
      parseConfiguredSources(
        'greenhouse:acme, lever:example,ashby:company,lever:example,indeed:bad,bad slug',
      ),
    ).toEqual([
      { source: 'greenhouse', identifier: 'acme' },
      { source: 'lever', identifier: 'example' },
      { source: 'ashby', identifier: 'company' },
    ]);
  });
});

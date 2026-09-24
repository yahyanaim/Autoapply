import { Test, TestingModule } from '@nestjs/testing';
import { JobService } from '../application/job.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobDeactivationReason, JobStatus } from '@prisma/client';

describe('JobService', () => {
  let service: JobService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      job: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback: unknown) => fallback),
          },
        },
      ],
    }).compile();

    service = module.get<JobService>(JobService);
  });

  describe('search', () => {
    it('should return paginated jobs', async () => {
      prismaMock.job.findMany.mockResolvedValue([
        { id: 'j1', title: 'Engineer' },
      ]);
      prismaMock.job.count.mockResolvedValue(1);
      const result = await service.search({
        query: 'Engineer',
        page: 1,
        limit: 10,
      });
      expect(result.jobs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.jobs[0]).not.toHaveProperty('deactivatedByUserId');
      expect(prismaMock.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              expect.objectContaining({
                status: JobStatus.active,
                capturedByUserId: null,
                scrapedAt: { gte: expect.any(Date) },
              }),
            ],
          }),
        }),
      );
    });
  });

  describe('getJob', () => {
    it('should return job by id', async () => {
      prismaMock.job.findFirst.mockResolvedValue({
        id: 'j1',
        title: 'Engineer',
      });
      const result = await service.getJob('j1');
      expect(result).toHaveProperty('id', 'j1');
      expect(result).not.toHaveProperty('deactivatedByUserId');
    });

    it('allows a user-owned captured job while requiring public listings to be fresh', async () => {
      prismaMock.job.findFirst.mockResolvedValue({
        id: 'captured-job',
        title: 'Engineer',
      });

      await service.getJob('captured-job', 'user-1');

      expect(prismaMock.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'captured-job',
            OR: [
              {
                status: JobStatus.active,
                capturedByUserId: null,
                scrapedAt: { gte: expect.any(Date) },
              },
              { capturedByUserId: 'user-1', status: JobStatus.active },
            ],
          },
        }),
      );
    });

    it('should throw NotFoundException if job not found', async () => {
      prismaMock.job.findFirst.mockResolvedValue(null);
      await expect(service.getJob('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('ingestJob', () => {
    it('should create a job', async () => {
      prismaMock.job.create.mockResolvedValue({
        id: 'j1',
        title: 'Engineer',
      });
      const result = await service.ingestJob({
        title: 'Engineer',
        source: 'greenhouse',
      });
      expect(result).toHaveProperty('id', 'j1');
    });

    it('returns a safe captured-job projection without administrative provenance', async () => {
      prismaMock.job.upsert.mockResolvedValue({
        id: 'captured-1',
        title: 'Engineer',
        status: JobStatus.active,
        deactivatedAt: null,
        deactivatedByUserId: null,
        deactivationReason: null,
      });

      const result = await service.captureJob({
        title: 'Engineer',
        source: 'extension',
        sourceUrl: 'https://example.test/jobs/1',
        capturedByUserId: 'user-1',
      });

      expect(result).not.toHaveProperty('deactivatedAt');
      expect(result).not.toHaveProperty('deactivatedByUserId');
      expect(result).not.toHaveProperty('deactivationReason');
    });

    it('does not return a captured job that was administratively deactivated', async () => {
      prismaMock.job.upsert.mockResolvedValue({
        id: 'captured-1',
        title: 'Engineer',
        status: JobStatus.deactivated,
        deactivatedAt: new Date(),
        deactivatedByUserId: 'admin-1',
        deactivationReason: JobDeactivationReason.security_risk,
      });

      await expect(
        service.captureJob({
          title: 'Engineer',
          source: 'extension',
          sourceUrl: 'https://example.test/jobs/1',
          capturedByUserId: 'user-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects non-HTTPS source URLs from external boards', async () => {
      await expect(
        service.ingestJob({
          title: 'Engineer',
          source: 'greenhouse',
          sourceUrl: 'javascript:alert(1)',
        }),
      ).rejects.toThrow('Job source URL must be a valid HTTPS URL');
      expect(prismaMock.job.upsert).not.toHaveBeenCalled();
    });

    it('isolates a captured job by user in its source key', async () => {
      prismaMock.job.upsert.mockResolvedValue({ id: 'captured-1' });
      await service.ingestJob({
        title: 'Engineer',
        source: 'rekrute.com',
        sourceUrl: 'https://www.rekrute.com/job/123',
        description: 'A complete job description for an engineering role.',
        capturedByUserId: 'user-1',
      });
      expect(prismaMock.job.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sourceKey: 'user-1:https://www.rekrute.com/job/123',
          },
          create: expect.objectContaining({
            capturedBy: { connect: { id: 'user-1' } },
          }),
          update: expect.objectContaining({ scrapedAt: expect.any(Date) }),
        }),
      );
      expect(prismaMock.job.upsert.mock.calls[0][0].update).not.toHaveProperty(
        'status',
      );
    });
  });

  describe('Admin operations reads', () => {
    it('uses the documented scrapedAt observation time for bounded eligibility', async () => {
      const now = new Date();
      prismaMock.job.findMany.mockResolvedValue([
        {
          id: 'job-1',
          title: 'Engineer',
          source: 'greenhouse',
          location: null,
          remoteType: null,
          status: JobStatus.active,
          scrapedAt: now,
          createdAt: now,
          company: { name: 'ApplyAI' },
        },
      ]);
      const result = await service.listForAdmin({ limit: 20, eligibility: 'eligible' });
      expect(result.jobs[0]).toEqual(expect.objectContaining({ lastObservedAt: now.toISOString(), eligible: true }));
      expect(prismaMock.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21, where: expect.objectContaining({ AND: [{ status: JobStatus.active }, { scrapedAt: { gte: expect.any(Date) } }] }), select: expect.not.objectContaining({ description: true, capturedByUserId: true }) }));
    });

    it('returns a projected job detail without captured URLs, descriptions, or captured-user data', async () => {
      const now = new Date();
      const sensitiveSourceUrl =
        'https://user:password@example.test/job?access_token=fake-sensitive-token&signature=fake-signature#private';
      prismaMock.job.findUnique.mockResolvedValue({ id: 'job-1', title: 'Engineer', source: 'greenhouse', sourceUrl: sensitiveSourceUrl, location: null, remoteType: null, status: JobStatus.active, deactivatedAt: null, deactivationReason: null, salaryMin: null, salaryMax: null, scrapedAt: now, createdAt: now, updatedAt: now, company: null, skills: [] });
      const result = await service.getForAdmin('job-1');
      expect(result).not.toHaveProperty('description');
      expect(result).not.toHaveProperty('sourceUrl');
      expect(JSON.stringify(result)).not.toContain('fake-sensitive-token');
      expect(JSON.stringify(result)).not.toContain('fake-signature');
      expect(JSON.stringify(result)).not.toContain('password');
      expect(prismaMock.job.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.not.objectContaining({ description: true, capturedByUserId: true, sourceUrl: true }) }));
    });
  });

  describe('deactivateInTransaction', () => {
    const transaction = {
      job: { updateMany: jest.fn(), findUnique: jest.fn() },
    };

    beforeEach(() => jest.clearAllMocks());

    it('sets durable state once with the approved provenance', async () => {
      transaction.job.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.deactivateInTransaction(
        transaction as never,
        'admin-1',
        'job-1',
        JobDeactivationReason.security_risk,
      );

      expect(transaction.job.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-1', status: JobStatus.active },
        data: {
          status: JobStatus.deactivated,
          deactivatedAt: expect.any(Date),
          deactivatedByUserId: 'admin-1',
          deactivationReason: JobDeactivationReason.security_risk,
        },
      });
      expect(result.value).toEqual(
        expect.objectContaining({
          jobId: 'job-1',
          status: JobStatus.deactivated,
          reason: JobDeactivationReason.security_risk,
        }),
      );
    });

    it('is idempotent and preserves original provenance', async () => {
      const original = new Date('2026-09-24T10:00:00.000Z');
      transaction.job.updateMany.mockResolvedValue({ count: 0 });
      transaction.job.findUnique.mockResolvedValue({
        status: JobStatus.deactivated,
        deactivatedAt: original,
        deactivationReason: JobDeactivationReason.provider_removed,
      });

      const result = await service.deactivateInTransaction(
        transaction as never,
        'another-admin',
        'job-1',
        JobDeactivationReason.other,
      );

      expect(result.value).toEqual({
        jobId: 'job-1',
        status: JobStatus.deactivated,
        deactivatedAt: original,
        reason: JobDeactivationReason.provider_removed,
      });
      expect(transaction.job.updateMany).toHaveBeenCalledTimes(1);
    });

    it('returns the safe repository not-found behavior', async () => {
      transaction.job.updateMany.mockResolvedValue({ count: 0 });
      transaction.job.findUnique.mockResolvedValue(null);

      await expect(
        service.deactivateInTransaction(
          transaction as never,
          'admin-1',
          'missing-job',
          JobDeactivationReason.other,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

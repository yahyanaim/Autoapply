import { Test, TestingModule } from '@nestjs/testing';
import { JobService } from '../application/job.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

describe('JobService', () => {
  let service: JobService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      job: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
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
      expect(prismaMock.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              expect.objectContaining({
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
                capturedByUserId: null,
                scrapedAt: { gte: expect.any(Date) },
              },
              { capturedByUserId: 'user-1' },
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
    });
  });
});

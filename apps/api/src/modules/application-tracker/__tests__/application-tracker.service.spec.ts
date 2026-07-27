import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationTrackerService } from '../application/application-tracker.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';

describe('ApplicationTrackerService', () => {
  let service: ApplicationTrackerService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      application: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      job: {
        findUnique: jest.fn(),
      },
      resumeVersion: { findFirst: jest.fn() },
      coverLetter: { findFirst: jest.fn() },
      usageLimit: {
        findUnique: jest.fn().mockResolvedValue({ applicationsUsed: 0, applicationsMax: 10, resetAt: new Date(Date.now() + 86_400_000) }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((callback: (client: any) => unknown) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationTrackerService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ApplicationTrackerService>(
      ApplicationTrackerService,
    );
  });

  describe('create', () => {
    it('should create an application', async () => {
      prismaMock.job.findUnique.mockResolvedValue({ id: 'j1' });
      prismaMock.application.create.mockResolvedValue({
        id: 'a1',
        status: 'draft',
      });
      const result = await service.create('u1', 'j1');
      expect(result).toHaveProperty('id', 'a1');
      expect(result.status).toBe('draft');
    });

    it('should throw NotFoundException if job not found', async () => {
      prismaMock.job.findUnique.mockResolvedValue(null);
      await expect(service.create('u1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should transition from draft to submitted', async () => {
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        jobId: 'j1',
        status: 'draft',
        timeline: [],
      });
      prismaMock.application.update.mockResolvedValue({
        id: 'a1',
        status: 'submitted',
      });
      const result = await service.updateStatus(
        'u1',
        'a1',
        ApplicationStatus.submitted,
      );
      expect(result.status).toBe('submitted');
    });

    it('should throw BadRequestException for invalid transition', async () => {
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        jobId: 'j1',
        status: 'draft',
        timeline: [],
      });
      await expect(
        service.updateStatus('u1', 'a1', ApplicationStatus.offer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if application not found', async () => {
      prismaMock.application.findFirst.mockResolvedValue(null);
      await expect(
        service.updateStatus('u1', 'nonexistent', ApplicationStatus.submitted),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTimeline', () => {
    it('should return timeline', async () => {
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        timeline: [{ status: 'draft' }],
      });
      const result = await service.getTimeline('u1', 'a1');
      expect(result.timeline).toBeDefined();
    });
  });

  describe('notes and usage', () => {
    it('adds a note to an application owned by the user', async () => {
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        timeline: [],
      });
      prismaMock.application.update.mockResolvedValue({
        id: 'a1',
        timeline: [{ type: 'note', note: 'Follow up Tuesday' }],
      });

      await expect(
        service.addNote('u1', 'a1', 'Follow up Tuesday'),
      ).resolves.toEqual(expect.objectContaining({ id: 'a1' }));
      expect(prismaMock.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: {
            timeline: [
              expect.objectContaining({
                type: 'note',
                note: 'Follow up Tuesday',
              }),
            ],
          },
        }),
      );
    });

    it('returns the current monthly application quota', async () => {
      const resetAt = new Date(Date.now() + 86_400_000);
      prismaMock.usageLimit.findUnique.mockResolvedValue({
        applicationsUsed: 4,
        applicationsMax: 10,
        resetAt,
      });

      await expect(service.getUsage('u1')).resolves.toEqual({
        used: 4,
        maximum: 10,
        unlimited: false,
        resetAt,
      });
    });
  });

  describe('list', () => {
    it('should return paginated applications', async () => {
      prismaMock.application.findMany.mockResolvedValue([{ id: 'a1' }]);
      prismaMock.application.count.mockResolvedValue(1);
      const result = await service.list('u1', { page: 1, limit: 10 });
      expect(result.applications).toHaveLength(1);
    });
  });

  describe('get and delete', () => {
    it('returns only an application owned by the user', async () => {
      prismaMock.application.findFirst.mockResolvedValue({ id: 'a1', userId: 'u1' });

      await expect(service.get('u1', 'a1')).resolves.toEqual(
        expect.objectContaining({ id: 'a1' }),
      );
      expect(prismaMock.application.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a1', userId: 'u1' } }),
      );
    });

    it('deletes only an application owned by the user', async () => {
      prismaMock.application.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.delete('u1', 'a1')).resolves.toEqual({
        message: 'Application deleted successfully',
      });
      expect(prismaMock.application.deleteMany).toHaveBeenCalledWith({
        where: { id: 'a1', userId: 'u1' },
      });
    });

    it('does not reveal or delete another user application', async () => {
      prismaMock.application.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.delete('u1', 'other')).rejects.toThrow(NotFoundException);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationTrackerService } from '../application/application-tracker.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  ApplicationPreparationStatus,
  ApplicationStatus,
} from '@prisma/client';
import { AIService } from '../../ai/application/ai.service';

describe('ApplicationTrackerService', () => {
  let service: ApplicationTrackerService;
  let prismaMock: any;
  let aiServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      application: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      job: {
        findFirst: jest.fn(),
      },
      resume: { findFirst: jest.fn() },
      resumeVersion: { findFirst: jest.fn(), update: jest.fn() },
      coverLetter: { findFirst: jest.fn(), update: jest.fn() },
      usageLimit: {
        findUnique: jest.fn().mockResolvedValue({
          applicationsUsed: 0,
          applicationsMax: 10,
          resetAt: new Date(Date.now() + 86_400_000),
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((operation: any) =>
        typeof operation === 'function'
          ? operation(prismaMock)
          : Promise.all(operation),
      ),
    };
    aiServiceMock = {
      analyzeJob: jest.fn(),
      optimizeResume: jest.fn(),
      generateCoverLetter: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationTrackerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AIService, useValue: aiServiceMock },
      ],
    }).compile();

    service = module.get<ApplicationTrackerService>(ApplicationTrackerService);
  });

  describe('prepare', () => {
    it('creates one reviewable package from the job and source resume', async () => {
      prismaMock.job.findFirst.mockResolvedValue({ id: 'j1' });
      prismaMock.resume.findFirst.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        parseStatus: 'ready',
        parsedJson: { skills: ['TypeScript'] },
      });
      prismaMock.application.create.mockResolvedValue({ id: 'a1' });
      prismaMock.application.findUnique.mockResolvedValue({ timeline: [] });
      prismaMock.application.update.mockResolvedValue({ id: 'a1' });
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        preparationStatus: 'ready_for_review',
      });
      aiServiceMock.analyzeJob.mockResolvedValue({
        summary: 'Build reliable software',
        responsibilities: ['Build software'],
        requiredSkills: ['TypeScript'],
        preferredSkills: [],
        experienceLevel: '',
        education: [],
        languages: [],
        keywords: ['TypeScript'],
      });
      aiServiceMock.optimizeResume.mockResolvedValue({ versionId: 'rv1' });
      aiServiceMock.generateCoverLetter.mockResolvedValue({ id: 'cl1' });

      await expect(service.prepare('u1', 'j1', 'r1')).resolves.toEqual(
        expect.objectContaining({
          id: 'a1',
          preparationStatus: 'ready_for_review',
        }),
      );
      expect(aiServiceMock.analyzeJob).toHaveBeenCalledWith('u1', 'j1');
      expect(aiServiceMock.optimizeResume).toHaveBeenCalledWith(
        'u1',
        'r1',
        'j1',
        expect.objectContaining({ requiredSkills: ['TypeScript'] }),
      );
      expect(aiServiceMock.generateCoverLetter).toHaveBeenCalledWith(
        'u1',
        'j1',
        'r1',
        'professional',
        'rv1',
        expect.any(Object),
      );
    });
  });

  describe('create', () => {
    it('should create an application', async () => {
      prismaMock.job.findFirst.mockResolvedValue({ id: 'j1' });
      prismaMock.application.create.mockResolvedValue({
        id: 'a1',
        status: 'draft',
      });
      const result = await service.create('u1', 'j1');
      expect(result).toHaveProperty('id', 'a1');
      expect(result.status).toBe('draft');
    });

    it('should throw NotFoundException if job not found', async () => {
      prismaMock.job.findFirst.mockResolvedValue(null);
      await expect(service.create('u1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects generated materials that belong to a different job', async () => {
      prismaMock.job.findFirst.mockResolvedValue({ id: 'j1' });
      prismaMock.resumeVersion.findFirst.mockResolvedValue({
        id: 'rv1',
        resumeId: 'r1',
        jobId: 'j2',
      });

      await expect(service.create('u1', 'j1', 'rv1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.application.create).not.toHaveBeenCalled();
    });
  });

  describe('approval integrity', () => {
    const documentJson = {
      template: 'classic-ats-v1',
      contact: {
        fullName: 'Daniel Carter',
        email: 'daniel@example.com',
        phone: '',
        location: '',
      },
      profile: 'Software engineer',
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      languages: [],
    };

    it('stores content hashes when the user approves the complete package', async () => {
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        preparationStatus: ApplicationPreparationStatus.ready_for_review,
        jobAnalysis: { summary: 'Build software' },
        resumeVersion: { documentJson },
        coverLetter: { content: 'Dear hiring team' },
        timeline: [],
      });
      prismaMock.application.update.mockResolvedValue({ id: 'a1' });

      await service.approve('u1', 'a1');

      expect(prismaMock.application.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: expect.objectContaining({
          preparationStatus: ApplicationPreparationStatus.ready_to_submit,
          approvedAt: expect.any(Date),
          approvedResumeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          approvedCoverLetterHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      });
    });

    it('refuses an approved package whose content changed after approval', async () => {
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        approvedResumeHash: 'stale-resume-hash',
        approvedCoverLetterHash: 'stale-letter-hash',
        approvedAt: new Date(),
        job: {
          id: 'j1',
          title: 'Engineer',
          sourceUrl: 'https://example.com/jobs/1',
          company: { name: 'Example' },
        },
        resumeVersion: {
          id: 'rv1',
          resumeId: 'r1',
          documentJson,
        },
        coverLetter: { content: 'Changed after approval' },
      });

      await expect(
        service.getApprovedPackageBySourceUrl(
          'u1',
          'https://example.com/jobs/1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires explicit confirmation for substantially changed wording', async () => {
      const parsedJson = {
        skills: ['Campaign planning'],
        experience: [
          {
            company: 'North Agency',
            title: 'Marketing Specialist',
            startDate: '2021',
            endDate: '2024',
            description: 'Planned local digital campaigns.',
            highlights: ['Reported campaign performance'],
          },
        ],
        education: [],
        projects: [],
        certifications: [],
        languages: ['French'],
      };
      const changedDocument = {
        ...documentJson,
        profile: 'Marketing Specialist with campaign planning experience.',
        experience: [
          {
            ...parsedJson.experience[0],
            description:
              'Directed global acquisitions and negotiated television partnerships.',
          },
        ],
        skills: parsedJson.skills,
        languages: parsedJson.languages,
      };
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        preparationStatus: ApplicationPreparationStatus.ready_for_review,
        jobAnalysis: { summary: 'Lead campaigns' },
        sourceResume: { parsedJson },
        resumeVersion: { documentJson: changedDocument },
        coverLetter: { content: 'Dear hiring team' },
        timeline: [],
      });
      prismaMock.application.update.mockResolvedValue({ id: 'a1' });

      await expect(service.approve('u1', 'a1')).rejects.toThrow(
        'Confirm the highlighted wording',
      );
      await expect(service.approve('u1', 'a1', true)).resolves.toEqual(
        expect.anything(),
      );
      expect(prismaMock.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            preparationStatus: ApplicationPreparationStatus.ready_to_submit,
          }),
        }),
      );
    });
  });

  describe('manual material edits', () => {
    it('rejects a numerical achievement that is absent from the uploaded CV', async () => {
      const parsedJson = {
        skills: ['Figma'],
        experience: [
          {
            company: 'Studio Casa',
            title: 'Designer',
            startDate: '2020',
            endDate: '2024',
            description: 'Improved the design system.',
            highlights: [],
          },
        ],
        education: [],
        projects: [],
        certifications: [],
        languages: [],
      };
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        preparationStatus: ApplicationPreparationStatus.ready_for_review,
        sourceResume: { parsedJson },
        resumeVersion: {
          id: 'rv1',
          documentJson: {
            template: 'classic-ats-v1',
            contact: {
              fullName: 'Design Candidate',
              email: 'designer@example.com',
            },
            profile: 'Designer with Figma experience.',
            experience: parsedJson.experience,
            education: [],
            skills: ['Figma'],
            projects: [],
            certifications: [],
            languages: [],
          },
        },
        coverLetter: { id: 'cl1', content: 'Dear hiring team' },
        timeline: [],
      });

      await expect(
        service.updateMaterials('u1', 'a1', {
          experience: [
            {
              index: 0,
              description: 'Improved the design system by 45%.',
              highlights: [],
            },
          ],
        }),
      ).rejects.toThrow('45%');
      expect(prismaMock.resumeVersion.update).not.toHaveBeenCalled();
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
      prismaMock.application.findFirst.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
      });

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

      await expect(service.delete('u1', 'other')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

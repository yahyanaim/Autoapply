import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  ResumeParseFreeQueueToken,
  ResumeParsePaidQueueToken,
  ResumeService,
  StorageToken,
} from '../application/resume.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  ResumeParser,
  StaleResumeParseExecutionError,
} from '../infrastructure/parsers/resume-parser';
import { PlanAwareAiRouter } from '../../ai/application/plan-aware-ai.router';
import { ResumeParseJobSignatureService } from '../infrastructure/queue/resume-parse-job-signature.service';

describe('ResumeService', () => {
  let service: ResumeService;
  let prisma: any;
  let storage: any;
  let freeQueue: any;
  let paidQueue: any;
  let planAwareRouter: any;
  let jobSignature: any;
  let parser: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1' }),
      },
      resume: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      resumeVersion: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      resumeParseExecution: {
        create: jest.fn().mockResolvedValue({ id: 'execution-1' }),
        updateMany: jest.fn(),
      },
      resumeParseExecutionClaim: { updateMany: jest.fn() },
      usageLimit: {
        findUnique: jest.fn().mockResolvedValue({
          resumesUsed: 0,
          resumesMax: 1,
          storageBytesUsed: 0,
          storageBytesMax: 5 * 1024 * 1024,
        }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback: (transaction: any) => unknown) => callback(prisma)),
    };
    storage = { uploadFile: jest.fn(), downloadFile: jest.fn(), deleteFile: jest.fn() };
    freeQueue = { add: jest.fn() };
    paidQueue = { add: jest.fn() };
    planAwareRouter = {
      resolve: jest.fn().mockResolvedValue({ boundary: 'free' }),
    };
    jobSignature = { sign: jest.fn().mockReturnValue('a'.repeat(64)) };
    parser = { parse: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({ providers: [
      ResumeService,
      { provide: StorageToken, useValue: storage },
      { provide: ResumeParseFreeQueueToken, useValue: freeQueue },
      { provide: ResumeParsePaidQueueToken, useValue: paidQueue },
      { provide: PrismaService, useValue: prisma },
      { provide: ResumeParser, useValue: parser },
      { provide: PlanAwareAiRouter, useValue: planAwareRouter },
      { provide: ResumeParseJobSignatureService, useValue: jobSignature },
    ] }).compile();
    service = module.get(ResumeService);
  });

  it('uploads a valid PDF and enqueues parsing', async () => {
    const file = { buffer: Buffer.from('%PDF-content'), originalname: 'resume.pdf', mimetype: 'application/pdf', size: 12 } as Express.Multer.File;
    const created = { id: 'r1', userId: 'u1', originalFileUrl: '/uploads/resumes/r1.pdf' };
    storage.uploadFile.mockResolvedValue(created.originalFileUrl);
    prisma.resume.create.mockResolvedValue(created);
    freeQueue.add.mockResolvedValue({ id: 'q1' });

    await expect(service.upload('u1', file)).resolves.toEqual(created);
    expect(freeQueue.add).toHaveBeenCalledWith(
      'parse-resume',
      {
        resumeId: 'r1',
        userId: 'u1',
        executionBoundary: 'free',
        jobId: 'resume-parse-free-r1',
        signature: 'a'.repeat(64),
      },
      expect.objectContaining({ jobId: 'resume-parse-free-r1', attempts: 3 }),
    );
    expect(paidQueue.add).not.toHaveBeenCalled();
    expect(prisma.resumeParseExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resumeId: 'r1',
        generation: 0,
        origin: 'initial',
        executionBoundary: 'free',
        status: 'queued',
        maxAttempts: 3,
        queueName: 'resume-parse-free',
        queueJobId: 'resume-parse-free-r1',
      }),
    });
    expect(jobSignature.sign).toHaveBeenCalledWith({
      resumeId: 'r1',
      userId: 'u1',
      executionBoundary: 'free',
      jobId: 'resume-parse-free-r1',
    });
  });

  it('uses the trusted paid route rather than any client-selected queue', async () => {
    const file = { buffer: Buffer.from('%PDF-content'), originalname: 'resume.pdf', mimetype: 'application/pdf', size: 12 } as Express.Multer.File;
    const created = { id: 'r2', userId: 'u1', originalFileUrl: '/uploads/resumes/r2.pdf' };
    storage.uploadFile.mockResolvedValue(created.originalFileUrl);
    prisma.resume.create.mockResolvedValue(created);
    paidQueue.add.mockResolvedValue({ id: 'q2' });
    planAwareRouter.resolve.mockResolvedValue({ boundary: 'paid' });

    await expect(service.upload('u1', file)).resolves.toEqual(created);

    expect(paidQueue.add).toHaveBeenCalledWith(
      'parse-resume',
      expect.objectContaining({
        executionBoundary: 'paid',
        signature: 'a'.repeat(64),
      }),
      expect.objectContaining({ jobId: 'resume-parse-paid-r2' }),
    );
    expect(freeQueue.add).not.toHaveBeenCalled();
  });

  it('rejects content whose signature does not match the MIME type', async () => {
    const file = { buffer: Buffer.from('not-a-pdf'), originalname: 'resume.pdf', mimetype: 'application/pdf', size: 9 } as Express.Multer.File;
    await expect(service.upload('u1', file)).rejects.toThrow(BadRequestException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('requires data-processing consent before storing a resume', async () => {
    const file = { buffer: Buffer.from('%PDF-content'), originalname: 'resume.pdf', mimetype: 'application/pdf', size: 12 } as Express.Multer.File;
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.upload('u1', file)).rejects.toThrow(ForbiddenException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('rolls back the record and file when queueing fails', async () => {
    const file = { buffer: Buffer.from('%PDF-content'), originalname: 'resume.pdf', mimetype: 'application/pdf', size: 12 } as Express.Multer.File;
    storage.uploadFile.mockResolvedValue('/uploads/resumes/r1.pdf');
    prisma.resume.create.mockResolvedValue({ id: 'r1' });
    prisma.resume.delete.mockResolvedValue({});
    freeQueue.add.mockRejectedValue(new Error('redis unavailable'));
    await expect(service.upload('u1', file)).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.resume.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(storage.deleteFile).toHaveBeenCalledWith('/uploads/resumes/r1.pdf');
    expect(prisma.usageLimit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resumesUsed: { decrement: 1 } }) }),
    );
  });

  it('removes the uploaded object when the user has reached the resume quota', async () => {
    const file = { buffer: Buffer.from('%PDF-content'), originalname: 'resume.pdf', mimetype: 'application/pdf', size: 12 } as Express.Multer.File;
    storage.uploadFile.mockResolvedValue('/uploads/resumes/r1.pdf');
    prisma.usageLimit.findUnique.mockResolvedValue({
      resumesUsed: 1,
      resumesMax: 1,
      storageBytesUsed: 12,
      storageBytesMax: 5 * 1024 * 1024,
    });

    await expect(service.upload('u1', file)).rejects.toThrow(ForbiddenException);
    expect(prisma.resume.create).not.toHaveBeenCalled();
    expect(storage.deleteFile).toHaveBeenCalledWith('/uploads/resumes/r1.pdf');
  });

  it('downloads, parses, and stores structured content', async () => {
    prisma.resume.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1', originalFileUrl: '/uploads/resumes/r1.txt', mimeType: 'text/plain' });
    storage.downloadFile.mockResolvedValue(Buffer.from('resume text'));
    parser.parse.mockResolvedValue({ skills: ['TypeScript'], experience: [], education: [], projects: [], languages: [], certifications: [] });
    prisma.resume.update.mockResolvedValue({ id: 'r1' });

    const result = await service.parse('r1');
    expect(parser.parse).toHaveBeenCalledWith('resume text', 'u1', undefined);
    expect(result.parsedJson).toEqual(expect.objectContaining({ skills: ['TypeScript'] }));
    expect(prisma.resume.update).toHaveBeenLastCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({ parseStatus: 'ready', parseError: null }),
    });
  });

  it('commits a parsed result only through the active execution fence', async () => {
    prisma.resume.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      originalFileUrl: '/uploads/resumes/r1.txt',
      mimeType: 'text/plain',
    });
    storage.downloadFile.mockResolvedValue(Buffer.from('resume text'));
    parser.parse.mockResolvedValue({
      skills: ['TypeScript'],
      experience: [],
      education: [],
      projects: [],
      languages: [],
      certifications: [],
    });
    prisma.resumeParseExecutionClaim.updateMany.mockResolvedValue({ count: 1 });
    prisma.resumeParseExecution.updateMany.mockResolvedValue({ count: 1 });
    prisma.resume.update.mockResolvedValue({ id: 'r1' });

    await expect(
      service.parse('r1', 'free', {
        executionId: 'execution-1',
        claimId: 'claim-1',
        leaseVersion: 2,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'r1' }));

    expect(prisma.resumeParseExecutionClaim.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'claim-1',
        executionId: 'execution-1',
        leaseVersion: 2,
        leaseExpiresAt: { gt: expect.any(Date) },
      },
      data: { leaseExpiresAt: null },
    });
    expect(prisma.resumeParseExecution.updateMany).toHaveBeenCalledWith({
      where: { id: 'execution-1', status: 'processing' },
      data: expect.objectContaining({ status: 'succeeded' }),
    });
  });

  it('prevents a stale or expired worker lease from committing parsed content', async () => {
    prisma.resume.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      originalFileUrl: '/uploads/resumes/r1.txt',
      mimeType: 'text/plain',
    });
    storage.downloadFile.mockResolvedValue(Buffer.from('resume text'));
    parser.parse.mockResolvedValue({
      skills: [],
      experience: [],
      education: [],
      projects: [],
      languages: [],
      certifications: [],
    });
    prisma.resumeParseExecutionClaim.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.parse('r1', 'free', {
        executionId: 'execution-1',
        claimId: 'claim-1',
        leaseVersion: 1,
      }),
    ).rejects.toBeInstanceOf(StaleResumeParseExecutionError);
    expect(prisma.resumeParseExecution.updateMany).not.toHaveBeenCalled();
    expect(prisma.resume.update).not.toHaveBeenCalled();
  });

  it('returns a completed parse idempotently without calling storage or AI again', async () => {
    prisma.resume.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      originalFileUrl: '/uploads/resumes/r1.pdf',
      parseStatus: 'ready',
      parsedJson: { skills: ['TypeScript'] },
    });

    await expect(service.parse('r1')).resolves.toEqual(
      expect.objectContaining({ parsedJson: { skills: ['TypeScript'] } }),
    );
    expect(storage.downloadFile).not.toHaveBeenCalled();
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('records a terminal parsing failure for the dashboard', async () => {
    prisma.resume.updateMany.mockResolvedValue({ count: 1 });

    await service.markParseFailed('r1');

    expect(prisma.resume.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({
        parseStatus: 'failed',
        parseError: expect.stringContaining('Resume parsing failed'),
      }),
    });
  });

  it('rejects access to another user\'s resume', async () => {
    prisma.resume.findUnique.mockResolvedValue({ id: 'r1', userId: 'other' });
    await expect(service.getResume('u1', 'r1')).rejects.toThrow(ForbiddenException);
  });

  it('returns not found for an unknown resume', async () => {
    prisma.resume.findUnique.mockResolvedValue(null);
    await expect(service.getResume('u1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('deletes an owned resume and its stored file', async () => {
    const resume = { id: 'r1', userId: 'u1', originalFileUrl: '/uploads/resumes/r1.pdf' };
    prisma.resume.findUnique.mockResolvedValue(resume);
    prisma.resume.delete.mockResolvedValue(resume);
    await expect(service.deleteResume('u1', 'r1')).resolves.toEqual(resume);
    expect(storage.deleteFile).toHaveBeenCalledWith(resume.originalFileUrl);
  });

  it('returns only a generated CV version owned by the current user', async () => {
    prisma.resumeVersion.findFirst.mockResolvedValue({
      generatedAt: new Date('2026-07-27T12:00:00Z'),
      documentJson: {
        template: 'classic-ats-v1',
        contact: { fullName: 'Candidate', email: 'candidate@example.com' },
        profile: 'Software Engineer.',
        experience: [],
        education: [],
        skills: [],
        projects: [],
        certifications: [],
        languages: [],
      },
    });

    await expect(
      service.getGeneratedResumeVersion('u1', 'r1', 'v1'),
    ).resolves.toEqual(
      expect.objectContaining({
        document: expect.objectContaining({ template: 'classic-ats-v1' }),
      }),
    );
    expect(prisma.resumeVersion.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'v1',
        resumeId: 'r1',
        resume: { userId: 'u1' },
      },
      select: {
        documentJson: true,
        generatedAt: true,
      },
    });
  });

  it('does not reveal a generated CV version outside its tenant', async () => {
    prisma.resumeVersion.findFirst.mockResolvedValue(null);
    await expect(
      service.getGeneratedResumeVersion('u1', 'r1', 'other-version'),
    ).rejects.toThrow(NotFoundException);
  });
});

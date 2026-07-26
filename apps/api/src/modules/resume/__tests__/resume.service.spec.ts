import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ResumeService, ResumeParseQueueToken, StorageToken } from '../application/resume.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ResumeParser } from '../infrastructure/parsers/resume-parser';

describe('ResumeService', () => {
  let service: ResumeService;
  let prisma: any;
  let storage: any;
  let queue: any;
  let parser: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1' }),
      },
      resume: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
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
    queue = { add: jest.fn() };
    parser = { parse: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({ providers: [
      ResumeService,
      { provide: StorageToken, useValue: storage },
      { provide: ResumeParseQueueToken, useValue: queue },
      { provide: PrismaService, useValue: prisma },
      { provide: ResumeParser, useValue: parser },
    ] }).compile();
    service = module.get(ResumeService);
  });

  it('uploads a valid PDF and enqueues parsing', async () => {
    const file = { buffer: Buffer.from('%PDF-content'), originalname: 'resume.pdf', mimetype: 'application/pdf', size: 12 } as Express.Multer.File;
    const created = { id: 'r1', userId: 'u1', originalFileUrl: '/uploads/resumes/r1.pdf' };
    storage.uploadFile.mockResolvedValue(created.originalFileUrl);
    prisma.resume.create.mockResolvedValue(created);
    queue.add.mockResolvedValue({ id: 'q1' });

    await expect(service.upload('u1', file)).resolves.toEqual(created);
    expect(queue.add).toHaveBeenCalledWith('parse-resume', { resumeId: 'r1', userId: 'u1' }, expect.objectContaining({ jobId: 'resume-parse-r1', attempts: 3 }));
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
    queue.add.mockRejectedValue(new Error('redis unavailable'));
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
    expect(parser.parse).toHaveBeenCalledWith('resume text', 'u1');
    expect(result.parsedJson).toEqual(expect.objectContaining({ skills: ['TypeScript'] }));
    expect(prisma.resume.update).toHaveBeenLastCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({ parseStatus: 'ready', parseError: null }),
    });
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
});

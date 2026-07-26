import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { StoragePort } from '../../../shared/ports/storage.port';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  ResumeParser,
  UnrecoverableResumeParseError,
} from '../infrastructure/parsers/resume-parser';
import { PdfParser } from '../infrastructure/parsers/pdf.parser';
import { DocxParser } from '../infrastructure/parsers/docx.parser';
import { Prisma, ResumeParseStatus } from '@prisma/client';

export const StorageToken = Symbol('StoragePort');
export const ResumeParseQueueToken = Symbol('ResumeParseQueue');
export const ResumeParseDeadLetterQueueToken = Symbol(
  'ResumeParseDeadLetterQueue',
);
const QUOTA_TRANSACTION_RETRIES = 3;

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);

  constructor(
    @Inject(StorageToken)
    private readonly storageAdapter: StoragePort,
    @Inject(ResumeParseQueueToken)
    private readonly parseQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly resumeParser: ResumeParser,
  ) {}

  async upload(userId: string, file: Express.Multer.File) {
    this.validateFile(file);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, dataProcessingConsentAt: { not: null } },
      select: { id: true },
    });
    if (!user) {
      throw new ForbiddenException(
        'Data-processing consent is required before uploading a resume',
      );
    }
    const fileUrl = await this.storageAdapter.uploadFile(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      'resumes',
    );

    let resume;
    try {
      resume = await this.createResumeWithQuota(userId, file, fileUrl);
    } catch (error) {
      try {
        await this.storageAdapter.deleteFile(fileUrl);
      } catch (cleanupError) {
        this.logger.error(
          `Failed to remove uncommitted resume object ${fileUrl}: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`,
        );
      }
      throw error;
    }

    try {
      await this.parseQueue.add(
        'parse-resume',
        { resumeId: resume.id, userId },
        {
          jobId: `resume-parse-${resume.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    } catch {
      await Promise.allSettled([
        this.deleteResumeRecord(userId, resume.id, resume.fileSize ?? 0),
        this.storageAdapter.deleteFile(fileUrl),
      ]);
      throw new ServiceUnavailableException('Resume processing queue is unavailable');
    }

    return resume;
  }

  async parse(resumeId: string) {
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
    });
    if (!resume) {
      throw new NotFoundException('Resume not found');
    }
    if (resume.parseStatus === ResumeParseStatus.ready && resume.parsedJson) {
      return { ...resume, parsedJson: resume.parsedJson };
    }

    await this.prisma.resume.update({
      where: { id: resumeId },
      data: {
        parseStatus: ResumeParseStatus.processing,
        parseError: null,
      },
    });

    const fileBuffer = await this.storageAdapter.downloadFile(resume.originalFileUrl);

    let rawText: string;
    try {
      if (resume.mimeType === 'application/pdf') {
        rawText = await PdfParser.extractText(fileBuffer);
      } else if (
        resume.mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        rawText = await DocxParser.extractText(fileBuffer);
      } else {
        rawText = fileBuffer.toString('utf-8');
      }
    } catch {
      throw new UnrecoverableResumeParseError('The resume document could not be read');
    }
    if (!rawText.trim()) {
      throw new UnrecoverableResumeParseError('The resume contains no readable text');
    }

    const parsedJson = await this.resumeParser.parse(rawText, resume.userId);

    const updated = await this.prisma.resume.update({
      where: { id: resumeId },
      data: {
        parsedJson: parsedJson as unknown as Prisma.InputJsonValue,
        parseStatus: ResumeParseStatus.ready,
        parseError: null,
      },
    });

    return { ...updated, parsedJson };
  }

  async markParseFailed(resumeId: string): Promise<void> {
    await this.prisma.resume.updateMany({
      where: { id: resumeId },
      data: {
        parseStatus: ResumeParseStatus.failed,
        parseError: 'Resume parsing failed. Check the file and AI provider configuration, then upload it again.',
      },
    });
  }

  async getResume(userId: string, resumeId: string) {
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
    });
    if (!resume) {
      throw new NotFoundException('Resume not found');
    }
    if (resume.userId !== userId) {
      throw new ForbiddenException('You do not have access to this resume');
    }
    return resume;
  }

  async listResumes(userId: string) {
    return this.prisma.resume.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteResume(userId: string, resumeId: string) {
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
    });
    if (!resume) {
      throw new NotFoundException('Resume not found');
    }
    if (resume.userId !== userId) {
      throw new ForbiddenException('You do not have access to this resume');
    }

    await this.storageAdapter.deleteFile(resume.originalFileUrl);
    return this.deleteResumeRecord(userId, resumeId, resume.fileSize ?? 0);
  }

  private async deleteResumeRecord(
    userId: string,
    resumeId: string,
    fileSize: number,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.resume.delete({ where: { id: resumeId } });
      await transaction.usageLimit.updateMany({
        where: { userId, resumesUsed: { gt: 0 } },
        data: {
          resumesUsed: { decrement: 1 },
          storageBytesUsed: {
            decrement: Math.max(0, fileSize),
          },
        },
      });
      return deleted;
    });
  }

  private async createResumeWithQuota(
    userId: string,
    file: Express.Multer.File,
    fileUrl: string,
  ) {
    for (let attempt = 1; attempt <= QUOTA_TRANSACTION_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const quota = await transaction.usageLimit.findUnique({
              where: { userId },
            });
            if (!quota) throw new NotFoundException('Usage limit not found for user');
            if (
              quota.resumesUsed >= quota.resumesMax ||
              quota.storageBytesUsed + file.size > quota.storageBytesMax
            ) {
              throw new ForbiddenException('Resume storage limit reached for this plan');
            }
            await transaction.usageLimit.update({
              where: { userId },
              data: {
                resumesUsed: { increment: 1 },
                storageBytesUsed: { increment: file.size },
              },
            });
            return transaction.resume.create({
              data: {
                userId,
                originalFileUrl: fileUrl,
                fileName: file.originalname,
                fileSize: file.size,
                mimeType: file.mimetype,
                isPrimary: false,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!retryable || attempt === QUOTA_TRANSACTION_RETRIES) throw error;
      }
    }
    throw new ServiceUnavailableException('Could not reserve resume storage');
  }

  private validateFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('A resume file is required');
    const allowed = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException('Only PDF and DOCX resumes are supported');
    }
    const isPdf = file.mimetype === 'application/pdf';
    const signature = file.buffer.subarray(0, 5).toString('binary');
    if ((isPdf && signature !== '%PDF-') || (!isPdf && !signature.startsWith('PK'))) {
      throw new BadRequestException('The uploaded file content does not match its type');
    }
    if (!isPdf) {
      try {
        DocxParser.validateArchive(file.buffer);
      } catch {
        throw new BadRequestException('The DOCX archive is invalid or expands beyond safe limits');
      }
    }
  }
}

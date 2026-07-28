import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ApplicationPreparationStatus,
  ApplicationStatus,
  Prisma,
  ResumeParseStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';
import { AIService } from '../../ai/application/ai.service';
import { readJobAnalysis } from '../../ai/domain/job-analysis';
import { detectFabrications } from '../../ai/domain/fabrication-detector';
import {
  GeneratedResumeDocument,
  generatedResumeToText,
  isGeneratedResumeDocument,
  verifiedResumeToText,
} from '../../resume/domain/generated-resume';
import { ApplicationEntity } from '../domain/application.entity';
import { RegenerationTarget } from '../interface/dto/regenerate-application.dto';
import { UpdateApplicationMaterialsDto } from '../interface/dto/update-materials.dto';

@Injectable()
export class ApplicationTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async create(
    userId: string,
    jobId: string,
    resumeVersionId?: string,
    coverLetterId?: string,
  ) {
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        OR: [{ capturedByUserId: null }, { capturedByUserId: userId }],
      },
    });
    if (!job) throw new NotFoundException('Job not found');

    const resumeVersion = resumeVersionId
      ? await this.prisma.resumeVersion.findFirst({
          where: { id: resumeVersionId, resume: { userId } },
        })
      : null;
    if (resumeVersionId && !resumeVersion) {
      throw new NotFoundException('Resume version not found');
    }
    if (resumeVersion?.jobId && resumeVersion.jobId !== jobId) {
      throw new BadRequestException('Resume version belongs to a different job');
    }

    const coverLetter = coverLetterId
      ? await this.prisma.coverLetter.findFirst({
          where: { id: coverLetterId, userId },
        })
      : null;
    if (coverLetterId && !coverLetter) {
      throw new NotFoundException('Cover letter not found');
    }
    if (coverLetter?.jobId && coverLetter.jobId !== jobId) {
      throw new BadRequestException('Cover letter belongs to a different job');
    }
    if (
      coverLetter?.resumeVersionId &&
      resumeVersionId &&
      coverLetter.resumeVersionId !== resumeVersionId
    ) {
      throw new BadRequestException(
        'Cover letter belongs to a different resume version',
      );
    }

    const usageResetAt = await this.reserveApplication(userId);
    try {
      return await this.prisma.application.create({
        data: {
          userId,
          jobId,
          sourceResumeId: resumeVersion?.resumeId,
          resumeVersionId,
          coverLetterId,
          status: ApplicationStatus.draft,
          preparationStatus:
            resumeVersionId && coverLetterId
              ? ApplicationPreparationStatus.ready_for_review
              : ApplicationPreparationStatus.job_captured,
          timeline: [
            {
              status: ApplicationStatus.draft,
              timestamp: this.clock.now().toISOString(),
              note: 'Application created',
            },
          ],
        },
        include: { job: { include: { company: true, skills: true } } },
      });
    } catch (error) {
      await this.releaseApplicationReservation(userId, usageResetAt);
      throw error;
    }
  }

  async prepare(userId: string, jobId: string, resumeId: string) {
    const [job, resume] = await Promise.all([
      this.prisma.job.findFirst({
        where: {
          id: jobId,
          OR: [{ capturedByUserId: null }, { capturedByUserId: userId }],
        },
      }),
      this.prisma.resume.findFirst({ where: { id: resumeId, userId } }),
    ]);
    if (!job) throw new NotFoundException('Job not found');
    if (!resume) throw new NotFoundException('Resume not found');
    if (
      resume.parseStatus !== ResumeParseStatus.ready ||
      resume.parsedJson === null
    ) {
      throw new BadRequestException('Resume parsing is not complete');
    }

    const usageResetAt = await this.reserveApplication(userId);
    let applicationId: string | undefined;
    try {
      const created = await this.prisma.application.create({
        data: {
          userId,
          jobId,
          sourceResumeId: resumeId,
          status: ApplicationStatus.draft,
          preparationStatus: ApplicationPreparationStatus.analyzing,
          timeline: [
            {
              type: 'workflow',
              timestamp: this.clock.now().toISOString(),
              note: 'Application preparation started',
            },
          ],
        },
      });
      applicationId = created.id;

      const jobAnalysis = await this.aiService.analyzeJob(userId, jobId);
      await this.setPreparationState(
        created.id,
        ApplicationPreparationStatus.generating,
        'Job requirements analyzed; generating application materials',
        { jobAnalysis: jobAnalysis as unknown as Prisma.InputJsonValue },
      );

      const optimized = await this.aiService.optimizeResume(
        userId,
        resumeId,
        jobId,
        jobAnalysis,
      );
      const coverLetter = await this.aiService.generateCoverLetter(
        userId,
        jobId,
        resumeId,
        'professional',
        optimized.versionId,
        jobAnalysis,
      );

      await this.setPreparationState(
        created.id,
        ApplicationPreparationStatus.ready_for_review,
        'Optimized CV and cover letter are ready for review',
        {
          resumeVersionId: optimized.versionId,
          coverLetterId: coverLetter.id,
          generationError: null,
        },
      );
      return this.get(userId, created.id);
    } catch (error) {
      if (applicationId) {
        await this.setPreparationState(
          applicationId,
          ApplicationPreparationStatus.generation_failed,
          'Application preparation failed',
          {
            generationError:
              'Application preparation failed. Review the job and resume, then retry.',
          },
        ).catch(() => undefined);
      } else {
        await this.releaseApplicationReservation(userId, usageResetAt);
      }
      throw error;
    }
  }

  async regenerate(
    userId: string,
    id: string,
    target: RegenerationTarget,
  ) {
    const application = await this.getOwnedPackage(userId, id);
    if (!application.sourceResumeId) {
      throw new BadRequestException('The source resume is unavailable');
    }
    if (application.status !== ApplicationStatus.draft) {
      throw new BadRequestException('Submitted applications cannot be regenerated');
    }

    const jobAnalysis = application.jobAnalysis
      ? readJobAnalysis(application.jobAnalysis)
      : await this.aiService.analyzeJob(userId, application.jobId);
    await this.setPreparationState(
      id,
      ApplicationPreparationStatus.generating,
      `Regenerating ${target === RegenerationTarget.all ? 'application package' : target}`,
      {
        jobAnalysis: jobAnalysis as unknown as Prisma.InputJsonValue,
        approvedAt: null,
        approvedResumeHash: null,
        approvedCoverLetterHash: null,
        generationError: null,
      },
    );

    try {
      let resumeVersionId = application.resumeVersionId;
      if (
        target === RegenerationTarget.resume ||
        target === RegenerationTarget.all
      ) {
        const optimized = await this.aiService.optimizeResume(
          userId,
          application.sourceResumeId,
          application.jobId,
          jobAnalysis,
        );
        resumeVersionId = optimized.versionId;
      }
      if (!resumeVersionId) {
        throw new BadRequestException('Generate the optimized resume first');
      }

      let coverLetterId = application.coverLetterId;
      if (
        target === RegenerationTarget.cover_letter ||
        target === RegenerationTarget.resume ||
        target === RegenerationTarget.all
      ) {
        const letter = await this.aiService.generateCoverLetter(
          userId,
          application.jobId,
          application.sourceResumeId,
          'professional',
          resumeVersionId,
          jobAnalysis,
        );
        coverLetterId = letter.id;
      }

      await this.setPreparationState(
        id,
        ApplicationPreparationStatus.ready_for_review,
        'Regenerated materials are ready for review',
        { resumeVersionId, coverLetterId },
      );
      return this.get(userId, id);
    } catch (error) {
      await this.setPreparationState(
        id,
        ApplicationPreparationStatus.generation_failed,
        'Application regeneration failed',
        {
          generationError:
            'Application regeneration failed. Check the materials and retry.',
        },
      ).catch(() => undefined);
      throw error;
    }
  }

  async updateMaterials(
    userId: string,
    id: string,
    edits: UpdateApplicationMaterialsDto,
  ) {
    const application = await this.getOwnedPackage(userId, id);
    if (
      application.preparationStatus !==
        ApplicationPreparationStatus.ready_for_review &&
      application.preparationStatus !==
        ApplicationPreparationStatus.ready_to_submit
    ) {
      throw new BadRequestException('Application materials are not ready to edit');
    }
    if (
      !application.resumeVersion?.documentJson ||
      !isGeneratedResumeDocument(application.resumeVersion.documentJson) ||
      !application.sourceResume?.parsedJson
    ) {
      throw new BadRequestException('Generated CV is unavailable');
    }

    const document = structuredClone(
      application.resumeVersion.documentJson,
    ) as GeneratedResumeDocument;
    if (edits.profile !== undefined) {
      const profile = cleanUserText(edits.profile, 1_200);
      if (!profile) throw new BadRequestException('Profile cannot be empty');
      document.profile = profile;
    }
    for (const edit of edits.experience ?? []) {
      const item = document.experience[edit.index];
      if (!item) throw new BadRequestException('Invalid experience section');
      item.description = cleanUserText(edit.description, 2_000);
      item.highlights = edit.highlights
        .map((value) => cleanUserText(value, 500))
        .filter(Boolean);
    }
    for (const edit of edits.projects ?? []) {
      const item = document.projects[edit.index];
      if (!item) throw new BadRequestException('Invalid project section');
      item.description = cleanUserText(edit.description, 1_500);
    }

    const optimizedText = generatedResumeToText(document, false);
    const verifiedText = verifiedResumeToText(
      application.sourceResume.parsedJson,
    );
    const fabrications = detectFabrications(
      {
        content: `${JSON.stringify(
          application.sourceResume.parsedJson,
        )}\n${verifiedText}`,
      },
      { content: optimizedText },
    );
    if (fabrications.length) {
      throw new BadRequestException(
        'Edited CV contains claims that are not supported by the original resume',
      );
    }

    const updates: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.resumeVersion.update({
        where: { id: application.resumeVersion.id },
        data: {
          documentJson: document as unknown as Prisma.InputJsonValue,
          optimizedText,
        },
      }),
    ];
    if (edits.coverLetter !== undefined) {
      if (!application.coverLetter) {
        throw new BadRequestException('Cover letter is unavailable');
      }
      const content = cleanMultilineText(edits.coverLetter, 8_000);
      if (!content) throw new BadRequestException('Cover letter cannot be empty');
      updates.push(
        this.prisma.coverLetter.update({
          where: { id: application.coverLetter.id },
          data: { content },
        }),
      );
    }
    updates.push(
      this.prisma.application.update({
        where: { id },
        data: {
          preparationStatus: ApplicationPreparationStatus.ready_for_review,
          approvedAt: null,
          approvedResumeHash: null,
          approvedCoverLetterHash: null,
          timeline: this.appendTimeline(
            application.timeline,
            'Application materials edited; approval is required again',
            'workflow',
          ),
        },
      }),
    );
    await this.prisma.$transaction(updates);
    return this.get(userId, id);
  }

  async approve(userId: string, id: string) {
    const application = await this.getOwnedPackage(userId, id);
    if (
      application.preparationStatus !==
      ApplicationPreparationStatus.ready_for_review
    ) {
      throw new BadRequestException('Application is not ready for approval');
    }
    if (
      !application.resumeVersion?.documentJson ||
      !application.coverLetter ||
      !application.jobAnalysis
    ) {
      throw new BadRequestException('Application package is incomplete');
    }

    const approvedAt = this.clock.now();
    await this.prisma.application.update({
      where: { id },
      data: {
        preparationStatus: ApplicationPreparationStatus.ready_to_submit,
        approvedAt,
        approvedResumeHash: hashContent(application.resumeVersion.documentJson),
        approvedCoverLetterHash: hashContent(application.coverLetter.content),
        timeline: this.appendTimeline(
          application.timeline,
          'Application package approved by the user',
          'approval',
        ),
      },
    });
    return this.get(userId, id);
  }

  async getApprovedPackageBySourceUrl(userId: string, sourceUrl: string) {
    const normalizedUrl = normalizeHttpsUrl(sourceUrl);
    const application = await this.prisma.application.findFirst({
      where: {
        userId,
        status: ApplicationStatus.draft,
        preparationStatus: ApplicationPreparationStatus.ready_to_submit,
        job: { sourceUrl: normalizedUrl },
      },
      include: {
        job: { include: { company: true } },
        resumeVersion: true,
        coverLetter: true,
      },
      orderBy: { approvedAt: 'desc' },
    });
    if (
      !application?.resumeVersion?.documentJson ||
      !isGeneratedResumeDocument(application.resumeVersion.documentJson) ||
      !application.coverLetter
    ) {
      throw new NotFoundException('No approved application package was found');
    }
    if (
      hashContent(application.resumeVersion.documentJson) !==
        application.approvedResumeHash ||
      hashContent(application.coverLetter.content) !==
        application.approvedCoverLetterHash
    ) {
      throw new BadRequestException(
        'Application materials changed after approval and must be reviewed again',
      );
    }
    return {
      applicationId: application.id,
      approvedAt: application.approvedAt,
      job: {
        id: application.job.id,
        title: application.job.title,
        company: application.job.company?.name ?? null,
        sourceUrl: application.job.sourceUrl,
      },
      contact: application.resumeVersion.documentJson.contact,
      coverLetter: application.coverLetter.content,
      resumeDownloadPath: `/resumes/${application.resumeVersion.resumeId}/versions/${application.resumeVersion.id}/pdf`,
    };
  }

  async list(
    userId: string,
    filters?: {
      status?: ApplicationStatus;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationWhereInput = { userId };
    if (filters?.status) where.status = filters.status;

    const [applications, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        skip,
        take: limit,
        include: { job: { include: { company: true, skills: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.application.count({ where }),
    ]);

    return { applications, total, page, limit };
  }

  async getUsage(userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const now = this.clock.now();
      await transaction.usageLimit.updateMany({
        where: { userId, resetAt: { lt: now } },
        data: {
          applicationsUsed: 0,
          aiRequestsUsed: 0,
          resumeOptimizationsUsed: 0,
          jobDiscoveriesUsed: 0,
          resetAt: this.getNextResetDate(now),
        },
      });
      const usage = await transaction.usageLimit.findUnique({
        where: { userId },
        select: {
          applicationsUsed: true,
          applicationsMax: true,
          resetAt: true,
        },
      });
      if (!usage) throw new NotFoundException('Usage limit not found for user');
      return {
        used: usage.applicationsUsed,
        maximum: usage.applicationsMax,
        unlimited: usage.applicationsMax >= 2_000_000_000,
        resetAt: usage.resetAt,
      };
    });
  }

  async get(userId: string, id: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
      include: {
        job: { include: { company: true, skills: true } },
        sourceResume: true,
        resumeVersion: true,
        coverLetter: true,
      },
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  async delete(userId: string, id: string) {
    const deleted = await this.prisma.application.deleteMany({
      where: { id, userId },
    });
    if (deleted.count !== 1) {
      throw new NotFoundException('Application not found');
    }
    return { message: 'Application deleted successfully' };
  }

  async updateStatus(userId: string, id: string, newStatus: ApplicationStatus) {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (
      newStatus === ApplicationStatus.submitted &&
      (application.resumeVersionId || application.coverLetterId) &&
      application.preparationStatus !==
        ApplicationPreparationStatus.ready_to_submit
    ) {
      throw new BadRequestException(
        'Review and approve the application package before marking it submitted',
      );
    }

    const entity = new ApplicationEntity(
      application.id,
      application.userId,
      application.jobId,
      application.status,
    );
    entity.transitionTo(newStatus);

    const timeline = this.timelineEntries(application.timeline);
    timeline.push({
      status: newStatus,
      timestamp: this.clock.now().toISOString(),
    });

    return this.prisma.application.update({
      where: { id },
      data: {
        status: entity.status,
        timeline,
        ...(newStatus === ApplicationStatus.submitted
          ? { appliedAt: this.clock.now() }
          : {}),
      },
      include: { job: { include: { company: true, skills: true } } },
    });
  }

  async getTimeline(userId: string, id: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
    });
    if (!application) throw new NotFoundException('Application not found');
    return { id: application.id, timeline: application.timeline };
  }

  async addNote(userId: string, id: string, note: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
    });
    if (!application) throw new NotFoundException('Application not found');

    return this.prisma.application.update({
      where: { id },
      data: {
        timeline: this.appendTimeline(application.timeline, note, 'note'),
      },
    });
  }

  private async getOwnedPackage(userId: string, id: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
      include: {
        sourceResume: true,
        resumeVersion: true,
        coverLetter: true,
      },
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  private async setPreparationState(
    id: string,
    status: ApplicationPreparationStatus,
    note: string,
    data: Prisma.ApplicationUncheckedUpdateInput = {},
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      select: { timeline: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    return this.prisma.application.update({
      where: { id },
      data: {
        ...data,
        preparationStatus: status,
        timeline: this.appendTimeline(application.timeline, note, 'workflow'),
      },
    });
  }

  private appendTimeline(
    timeline: Prisma.JsonValue,
    note: string,
    type: string,
  ): Prisma.InputJsonValue {
    return [
      ...this.timelineEntries(timeline),
      {
        type,
        timestamp: this.clock.now().toISOString(),
        note,
      },
    ] as Prisma.InputJsonValue;
  }

  private async reserveApplication(userId: string): Promise<Date> {
    return this.prisma.$transaction(async (transaction) => {
      const now = this.clock.now();
      await transaction.usageLimit.updateMany({
        where: { userId, resetAt: { lt: now } },
        data: {
          applicationsUsed: 0,
          aiRequestsUsed: 0,
          resumeOptimizationsUsed: 0,
          jobDiscoveriesUsed: 0,
          resetAt: this.getNextResetDate(now),
        },
      });
      const usage = await transaction.usageLimit.findUnique({ where: { userId } });
      if (!usage) throw new NotFoundException('Usage limit not found for user');
      const reserved = await transaction.usageLimit.updateMany({
        where: { userId, applicationsUsed: { lt: usage.applicationsMax } },
        data: { applicationsUsed: { increment: 1 } },
      });
      if (reserved.count !== 1) {
        throw new ForbiddenException('Application limit reached');
      }
      return usage.resetAt;
    });
  }

  private async releaseApplicationReservation(userId: string, resetAt: Date) {
    await this.prisma.usageLimit.updateMany({
      where: { userId, resetAt, applicationsUsed: { gt: 0 } },
      data: { applicationsUsed: { decrement: 1 } },
    });
  }

  private getNextResetDate(now: Date): Date {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
  }

  private timelineEntries(
    value: Prisma.JsonValue,
  ): Array<Prisma.InputJsonValue | null> {
    return Array.isArray(value)
      ? value.map((entry) => entry as Prisma.InputJsonValue | null)
      : [];
  }
}

function hashContent(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cleanUserText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanMultilineText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function normalizeHttpsUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('HTTPS is required');
    url.hash = '';
    return url.toString();
  } catch {
    throw new BadRequestException('A valid HTTPS job URL is required');
  }
}

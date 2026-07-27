import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { ApplicationEntity } from '../domain/application.entity';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

@Injectable()
export class ApplicationTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async create(
    userId: string,
    jobId: string,
    resumeVersionId?: string,
    coverLetterId?: string,
  ) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    if (resumeVersionId) {
      const resumeVersion = await this.prisma.resumeVersion.findFirst({
        where: { id: resumeVersionId, resume: { userId } },
      });
      if (!resumeVersion) throw new NotFoundException('Resume version not found');
    }
    if (coverLetterId) {
      const coverLetter = await this.prisma.coverLetter.findFirst({
        where: { id: coverLetterId, userId },
      });
      if (!coverLetter) throw new NotFoundException('Cover letter not found');
    }

    const usageResetAt = await this.reserveApplication(userId);
    try {
      return await this.prisma.application.create({
        data: {
          userId,
          jobId,
          resumeVersionId,
          coverLetterId,
          status: ApplicationStatus.draft,
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
      await this.prisma.usageLimit.updateMany({
        where: { userId, resetAt: usageResetAt, applicationsUsed: { gt: 0 } },
        data: { applicationsUsed: { decrement: 1 } },
      });
      throw error;
    }
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

    const timeline = this.timelineEntries(application.timeline);
    timeline.push({
      type: 'note',
      timestamp: this.clock.now().toISOString(),
      note,
    });

    return this.prisma.application.update({
      where: { id },
      data: { timeline },
    });
  }

  private async reserveApplication(userId: string): Promise<Date> {
    return this.prisma.$transaction(async (transaction) => {
      const now = this.clock.now();
      await transaction.usageLimit.updateMany({
        where: { userId, resetAt: { lt: now } },
        data: {
          applicationsUsed: 0,
          aiRequestsUsed: 0,
          resetAt: this.getNextResetDate(now),
        },
      });
      const usage = await transaction.usageLimit.findUnique({ where: { userId } });
      if (!usage) throw new NotFoundException('Usage limit not found for user');
      const reserved = await transaction.usageLimit.updateMany({
        where: { userId, applicationsUsed: { lt: usage.applicationsMax } },
        data: { applicationsUsed: { increment: 1 } },
      });
      if (reserved.count !== 1) throw new ForbiddenException('Application limit reached');
      return usage.resetAt;
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

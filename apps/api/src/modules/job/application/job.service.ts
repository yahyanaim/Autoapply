import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';
import { JobSearchFilter } from '../domain/job-search-filter';
import { Prisma } from '@prisma/client';
import {
  accessibleFreshJobWhere,
  visibleJobSources,
} from '../domain/job-visibility';

@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async search(filters: JobSearchFilter, userId?: string) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.JobWhereInput = {
      OR: visibleJobSources(
        userId,
        this.clock.now(),
        this.maximumPublicJobAgeHours(),
      ),
    };

    if (filters.query) {
      where.AND = [
        {
          OR: [
            { title: { contains: filters.query, mode: 'insensitive' } },
            { description: { contains: filters.query, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (filters.location) {
      where.location = { contains: filters.location, mode: 'insensitive' };
    }

    if (filters.remoteType) {
      where.remoteType = filters.remoteType;
    }

    if (filters.salaryMin) {
      where.salaryMax = { gte: filters.salaryMin };
    }

    if (filters.salaryMax) {
      where.salaryMin = { lte: filters.salaryMax };
    }

    if (filters.skills?.length) {
      where.skills = { some: { name: { in: filters.skills } } };
    }

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take: limit,
        include: { company: true, skills: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.job.count({ where }),
    ]);

    return { jobs, total, page, limit };
  }

  async getJob(id: string, userId?: string) {
    const now = this.clock.now();
    const job = await this.prisma.job.findFirst({
      where: userId
        ? accessibleFreshJobWhere(
            userId,
            id,
            now,
            this.maximumPublicJobAgeHours(),
          )
        : {
            id,
            OR: visibleJobSources(
              undefined,
              now,
              this.maximumPublicJobAgeHours(),
            ),
          },
      include: { company: true, skills: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async listForAdmin(input: {
    cursor?: string;
    limit?: number;
    search?: string;
    source?: string;
    eligibility?: 'eligible' | 'stale';
  }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const now = this.clock.now();
    const minimumObservedAt = new Date(
      now.getTime() - this.maximumPublicJobAgeHours() * 60 * 60 * 1_000,
    );
    const cursor = input.cursor ? this.decodeAdminCursor(input.cursor) : undefined;
    const search = input.search?.trim();
    const source = input.source?.trim();
    const jobs = await this.prisma.job.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' as const } },
                { company: { name: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
        ...(source ? { source: { equals: source, mode: 'insensitive' as const } } : {}),
        ...(input.eligibility === 'eligible'
          ? { scrapedAt: { gte: minimumObservedAt } }
          : input.eligibility === 'stale'
            ? { scrapedAt: { lt: minimumObservedAt } }
            : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        source: true,
        location: true,
        remoteType: true,
        scrapedAt: true,
        createdAt: true,
        company: { select: { name: true } },
      },
    });
    const page = jobs.slice(0, limit);
    const last = page.length > 0 ? page[page.length - 1] : undefined;
    return {
      jobs: page.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company?.name ?? null,
        source: job.source,
        location: job.location,
        remoteType: job.remoteType,
        lastObservedAt: job.scrapedAt.toISOString(),
        eligible: job.scrapedAt >= minimumObservedAt,
        createdAt: job.createdAt.toISOString(),
      })),
      limit,
      nextCursor:
        jobs.length > limit && last
          ? this.encodeAdminCursor(last.createdAt, last.id)
          : null,
    };
  }

  async getForAdmin(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        source: true,
        location: true,
        remoteType: true,
        salaryMin: true,
        salaryMax: true,
        scrapedAt: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { name: true } },
        skills: { select: { name: true }, take: 50, orderBy: { name: 'asc' } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    const minimumObservedAt = new Date(
      this.clock.now().getTime() -
        this.maximumPublicJobAgeHours() * 60 * 60 * 1_000,
    );
    return {
      id: job.id,
      title: job.title,
      company: job.company?.name ?? null,
      source: job.source,
      location: job.location,
      remoteType: job.remoteType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      skills: job.skills.map(({ name }) => name),
      lastObservedAt: job.scrapedAt.toISOString(),
      eligible: job.scrapedAt >= minimumObservedAt,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  async ingestJob(data: {
    title: string;
    source: string;
    sourceUrl?: string;
    description?: string;
    location?: string;
    companyName?: string;
    capturedByUserId?: string;
  }) {
    const sourceUrl = this.normalizeSourceUrl(data.sourceUrl);
    const title = data.title.trim();
    if (!title || title.length > 300) {
      throw new BadRequestException(
        'Job title must be between 1 and 300 characters',
      );
    }
    const source = data.source.trim().slice(0, 50);
    if (!source) throw new BadRequestException('Job source is required');
    const companyName = data.companyName?.trim().slice(0, 200);
    const company = companyName
      ? {
          connectOrCreate: {
            where: { name: companyName },
            create: { name: companyName },
          },
        }
      : undefined;
    const jobData = {
      title,
      source,
      description: data.description?.slice(0, 200_000),
      location: data.location?.trim().slice(0, 300),
      remoteType: /\bremote\b/i.test(data.location ?? '')
        ? ('remote' as const)
        : undefined,
      capturedBy: data.capturedByUserId
        ? { connect: { id: data.capturedByUserId } }
        : undefined,
      company,
    };
    if (!sourceUrl) return this.prisma.job.create({ data: jobData });
    const sourceKey = `${data.capturedByUserId ?? 'public'}:${sourceUrl}`;
    return this.prisma.job.upsert({
      where: { sourceKey },
      create: { ...jobData, sourceUrl, sourceKey },
      // `scrapedAt` is the last time an approved provider or the extension
      // observed this posting. It must move forward on refresh so discovery
      // does not rank a currently available job as stale.
      update: { ...jobData, scrapedAt: this.clock.now() },
    });
  }

  private maximumPublicJobAgeHours(): number {
    return this.config.get<number>(
      'JOB_DISCOVERY_MAX_JOB_AGE_HOURS',
      168,
    );
  }

  private normalizeSourceUrl(sourceUrl?: string): string | undefined {
    if (!sourceUrl) return undefined;
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== 'https:') throw new Error('HTTPS is required');
      parsed.hash = '';
      return parsed.toString();
    } catch {
      throw new BadRequestException('Job source URL must be a valid HTTPS URL');
    }
  }

  private encodeAdminCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }))
      .toString('base64url');
  }

  private decodeAdminCursor(value: string): { createdAt: Date; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        createdAt?: unknown;
        id?: unknown;
      };
      const createdAt = new Date(String(parsed.createdAt));
      if (
        typeof parsed.id !== 'string' ||
        !parsed.id ||
        !Number.isFinite(createdAt.getTime())
      ) {
        throw new Error('invalid');
      }
      return { createdAt, id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid jobs cursor');
    }
  }
}

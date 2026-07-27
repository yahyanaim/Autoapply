import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { JobSearchFilter } from '../domain/job-search-filter';
import { Prisma } from '@prisma/client';

@Injectable()
export class JobService {
  constructor(private readonly prisma: PrismaService) {}

  async search(filters: JobSearchFilter, userId?: string) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.JobWhereInput = {
      OR: userId
        ? [{ capturedByUserId: null }, { capturedByUserId: userId }]
        : [{ capturedByUserId: null }],
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
    const job = await this.prisma.job.findFirst({
      where: {
        id,
        OR: userId
          ? [{ capturedByUserId: null }, { capturedByUserId: userId }]
          : [{ capturedByUserId: null }],
      },
      include: { company: true, skills: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
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
      throw new BadRequestException('Job title must be between 1 and 300 characters');
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
      remoteType: /\bremote\b/i.test(data.location ?? '') ? 'remote' as const : undefined,
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
      update: jobData,
    });
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

}

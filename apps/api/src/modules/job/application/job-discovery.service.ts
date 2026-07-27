import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, RemoteType, ResumeParseStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { calculateMatchScore } from '../../ai/domain/match-score';
import { DiscoverJobsDto } from '../interface/dto/discover-jobs.dto';
import {
  JobIngestionService,
  JobSource,
} from './job-ingestion.service';

const MAX_CANDIDATES = 500;
const MAX_CONFIGURED_SOURCES = 8;
const MAX_REFRESHED_JOBS_PER_SOURCE = 250;

interface ConfiguredSource {
  source: JobSource;
  identifier: string;
}

export interface ResumeSearchProfile {
  roles: string[];
  skills: string[];
}

@Injectable()
export class JobDiscoveryService {
  private readonly logger = new Logger(JobDiscoveryService.name);
  private lastRefreshAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: JobIngestionService,
    private readonly config: ConfigService,
  ) {}

  async discover(userId: string, input: DiscoverJobsDto) {
    const resume = await this.prisma.resume.findFirst({
      where: { id: input.resumeId, userId },
      select: {
        id: true,
        parseStatus: true,
        parsedJson: true,
      },
    });
    if (!resume) throw new NotFoundException('Resume not found');
    if (
      resume.parseStatus !== ResumeParseStatus.ready ||
      resume.parsedJson === null
    ) {
      throw new BadRequestException(
        'The resume must finish parsing before jobs can be discovered',
      );
    }

    const sourceRefresh = await this.refreshConfiguredSources();
    const profile = readResumeSearchProfile(resume.parsedJson);
    const where = this.candidateWhere(userId, input);
    const candidates = await this.prisma.job.findMany({
      where,
      take: MAX_CANDIDATES,
      orderBy: [{ scrapedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        company: true,
        skills: true,
        applications: {
          where: { userId },
          select: { id: true, status: true },
          take: 1,
        },
      },
    });

    const resumeContent = JSON.stringify(resume.parsedJson);
    const ranked = candidates
      .filter((job) => Boolean(job.description?.trim()))
      .map((job) => {
        const match = calculateMatchScore(
          { content: resumeContent },
          `${job.title}\n${(job.description ?? '').slice(0, 50_000)}`,
        );
        const roleAlignment = calculateRoleAlignment(profile.roles, job.title);
        const skillAlignment = calculateResumeSkillAlignment(
          profile.skills,
          `${job.title}\n${(job.description ?? '').slice(0, 50_000)}`,
        );
        const score = Math.min(
          100,
          Math.max(
            0,
            Math.round(
              match.score * 0.65 +
                skillAlignment.score * 0.25 +
                roleAlignment * 0.1,
            ),
          ),
        );
        return {
          id: job.id,
          source: job.source,
          sourceUrl: job.sourceUrl,
          title: job.title,
          description: job.description?.slice(0, 5_000) ?? null,
          location: job.location,
          remoteType: job.remoteType,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          scrapedAt: job.scrapedAt,
          createdAt: job.createdAt,
          company: job.company,
          skills: job.skills,
          matchScore: score,
          matchedResumeSkills: skillAlignment.matched,
          missingKeywords: match.missingKeywords.slice(0, 12),
          weakSections: match.weakSections,
          explanation: [
            ...match.explanation,
            `Verified CV skill overlap: ${skillAlignment.score}%`,
            `Role-title alignment: ${roleAlignment}%`,
          ],
          trackedApplication: job.applications[0] ?? null,
          rankingScore: score + freshnessTieBreaker(job.scrapedAt),
        };
      })
      .sort((left, right) => right.rankingScore - left.rankingScore)
      .slice(0, Math.min(20, input.limit))
      .map(({ rankingScore: _rankingScore, ...job }) => job);

    return {
      resumeId: resume.id,
      generatedAt: new Date().toISOString(),
      requestedLimit: Math.min(20, input.limit),
      totalCandidates: candidates.length,
      searchProfile: profile,
      filters: {
        query: input.query || null,
        location: input.location || null,
        remoteType: input.remoteType || null,
      },
      sourceRefresh,
      jobs: ranked,
    };
  }

  private candidateWhere(
    userId: string,
    input: DiscoverJobsDto,
  ): Prisma.JobWhereInput {
    const constraints: Prisma.JobWhereInput[] = [
      {
        OR: [{ capturedByUserId: null }, { capturedByUserId: userId }],
      },
      {
        description: { not: null },
      },
    ];
    if (input.query) {
      constraints.push({
        OR: [
          { title: { contains: input.query, mode: 'insensitive' } },
          { description: { contains: input.query, mode: 'insensitive' } },
          {
            company: {
              name: { contains: input.query, mode: 'insensitive' },
            },
          },
        ],
      });
    }
    if (input.location) {
      constraints.push({
        location: { contains: input.location, mode: 'insensitive' },
      });
    }
    if (input.remoteType) {
      constraints.push({ remoteType: input.remoteType as RemoteType });
    }
    return { AND: constraints };
  }

  private async refreshConfiguredSources() {
    const sources = parseConfiguredSources(
      this.config.get<string>('JOB_DISCOVERY_SOURCES', ''),
    );
    if (!sources.length) return [];

    const ttlMinutes = this.config.get<number>(
      'JOB_DISCOVERY_REFRESH_TTL_MINUTES',
      30,
    );
    const now = Date.now();
    if (now - this.lastRefreshAt < ttlMinutes * 60_000) {
      return sources.map((source) => ({
        ...source,
        status: 'cached' as const,
      }));
    }

    const results: Array<{
      source: JobSource;
      identifier: string;
      status: 'refreshed' | 'failed';
      ingested?: number;
    }> = [];
    for (const source of sources) {
      try {
        const result = await this.ingestion.ingest(
          source.source,
          source.identifier,
          MAX_REFRESHED_JOBS_PER_SOURCE,
        );
        results.push({
          ...source,
          status: 'refreshed',
          ingested: result.ingested,
        });
      } catch (error) {
        this.logger.warn(
          `Discovery refresh failed for ${source.source}:${source.identifier}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        results.push({ ...source, status: 'failed' });
      }
    }
    this.lastRefreshAt = now;
    return results;
  }
}

export function parseConfiguredSources(value: string): ConfiguredSource[] {
  const results: ConfiguredSource[] = [];
  const seen = new Set<string>();
  for (const entry of value.split(',').map((item) => item.trim()).filter(Boolean)) {
    const separator = entry.indexOf(':');
    if (separator <= 0) continue;
    const source = entry.slice(0, separator).toLowerCase();
    const identifier = entry.slice(separator + 1).trim();
    if (
      !isJobSource(source) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(identifier)
    ) {
      continue;
    }
    const key = `${source}:${identifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ source, identifier });
    if (results.length === MAX_CONFIGURED_SOURCES) break;
  }
  return results;
}

function isJobSource(value: string): value is JobSource {
  return value === 'greenhouse' || value === 'lever' || value === 'ashby';
}

function readResumeSearchProfile(value: Prisma.JsonValue): ResumeSearchProfile {
  if (!isRecord(value)) return { roles: [], skills: [] };
  const roles = Array.isArray(value.experience)
    ? value.experience
        .map((item) =>
          isRecord(item) && typeof item.title === 'string'
            ? cleanLabel(item.title)
            : '',
        )
        .filter(Boolean)
    : [];
  const skills = Array.isArray(value.skills)
    ? value.skills
        .filter((item): item is string => typeof item === 'string')
        .map(cleanLabel)
        .filter(Boolean)
    : [];
  return {
    roles: [...new Set(roles)].slice(0, 5),
    skills: [...new Set(skills)].slice(0, 12),
  };
}

function calculateRoleAlignment(roles: string[], jobTitle: string): number {
  const roleTokens = new Set(roles.flatMap(tokenizeRole));
  const jobTokens = tokenizeRole(jobTitle);
  if (!roleTokens.size || !jobTokens.length) return 50;
  const matches = jobTokens.filter((token) => roleTokens.has(token)).length;
  return Math.round((matches / jobTokens.length) * 100);
}

function calculateResumeSkillAlignment(
  skills: string[],
  jobText: string,
): { score: number; matched: string[] } {
  if (!skills.length) return { score: 50, matched: [] };
  const normalizedJob = ` ${jobText.toLowerCase().replace(/\s+/g, ' ')} `;
  const matched = skills.filter((skill) => {
    const normalized = skill.toLowerCase().replace(/\s+/g, ' ').trim();
    return normalized.length >= 2 && normalizedJob.includes(normalized);
  });
  const denominator = Math.min(skills.length, 8);
  return {
    score: Math.min(100, Math.round((matched.length / denominator) * 100)),
    matched: matched.slice(0, 8),
  };
}

function tokenizeRole(value: string): string[] {
  const ignored = new Set([
    'and',
    'the',
    'for',
    'senior',
    'junior',
    'lead',
    'manager',
    'specialist',
  ]);
  return cleanLabel(value)
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((token) => token.length >= 3 && !ignored.has(token));
}

function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 160);
}

function freshnessTieBreaker(value: Date): number {
  const ageDays = Math.max(0, (Date.now() - value.getTime()) / 86_400_000);
  return Math.max(0, 0.99 - ageDays / 10_000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

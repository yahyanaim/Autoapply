import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  OFFICIAL_MOROCCO_CAREER_SOURCES,
  officialMoroccoCareerContext,
} from './career-chat-context.sources';
import type {
  CareerChatContext,
  CareerChatContextProvider,
} from '../domain/career-chat-context.interface';

const MOROCCO_LOCATION_TERMS = [
  'Morocco',
  'Maroc',
  'Casablanca',
  'Rabat',
  'Marrakech',
  'Tangier',
  'Tanger',
  'Agadir',
  'Fes',
  'Fez',
  'Meknes',
  'Kenitra',
  'Oujda',
] as const;

@Injectable()
export class CareerChatContextService implements CareerChatContextProvider {
  constructor(private readonly prisma: PrismaService) {}

  async build(): Promise<CareerChatContext> {
    const jobs = await this.prisma.job.findMany({
      where: {
        capturedByUserId: null,
        sourceUrl: { not: null },
        description: { not: null },
        OR: MOROCCO_LOCATION_TERMS.map((term) => ({
          location: { contains: term, mode: 'insensitive' as const },
        })),
      },
      select: {
        title: true,
        location: true,
        description: true,
        sourceUrl: true,
        company: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    });

    const jobSources = jobs.flatMap((job) => (job.sourceUrl ? [job.sourceUrl] : []));
    const listings = jobs.length
      ? jobs
          .map(
            (job, index) =>
              `${index + 1}. ${job.title} — ${
                job.company?.name || 'Company not listed'
              } — ${job.location || 'Location not listed'}\n` +
              `Summary: ${this.compact(job.description ?? '', 500)}\n` +
              `Source: ${job.sourceUrl}`,
          )
          .join('\n\n')
      : 'No verified Morocco listings are currently available in the ApplyAI database.';

    return {
      text: [
        officialMoroccoCareerContext(),
        '',
        'Recently indexed public Morocco job listings:',
        listings,
      ].join('\n'),
      allowedSources: [...OFFICIAL_MOROCCO_CAREER_SOURCES, ...jobSources],
    };
  }

  private compact(value: string, maximum: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length <= maximum
      ? normalized
      : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
  }
}

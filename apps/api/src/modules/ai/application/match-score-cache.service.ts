import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  calculateMatchScore,
  MatchScoreBreakdown,
  MatchScoreResult,
} from '../domain/match-score';

export const MATCH_SCORE_ALGORITHM_VERSION = 'match-score.v2';

export interface CachedMatchScoreResult extends MatchScoreResult {
  cached: boolean;
}

interface ScoreInput {
  description: string;
  inputHash: string;
}

@Injectable()
export class MatchScoreCacheService {
  private readonly logger = new Logger(MatchScoreCacheService.name);

  constructor(private readonly prisma: PrismaService) {}

  async score(
    resumeId: string,
    resumeContent: string,
    jobDescription: string,
  ): Promise<CachedMatchScoreResult> {
    const [result] = await this.scoreMany(resumeId, resumeContent, [
      jobDescription,
    ]);
    return result!;
  }

  async scoreMany(
    resumeId: string,
    resumeContent: string,
    jobDescriptions: string[],
  ): Promise<CachedMatchScoreResult[]> {
    if (jobDescriptions.length === 0) return [];

    const resumeHash = sha256(resumeContent);
    const inputs = jobDescriptions.map((description) => ({
      description,
      inputHash: sha256(
        [
          MATCH_SCORE_ALGORITHM_VERSION,
          resumeId,
          resumeHash,
          sha256(description),
        ].join(':'),
      ),
    }));

    try {
      return await this.readThroughCache(resumeId, resumeContent, inputs);
    } catch (error) {
      this.logger.warn(
        `Match-score cache unavailable; calculating without cache: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return inputs.map(({ description }) => ({
        ...calculateMatchScore(
          { content: resumeContent },
          description,
          'original CV',
        ),
        cached: false,
      }));
    }
  }

  private async readThroughCache(
    resumeId: string,
    resumeContent: string,
    inputs: ScoreInput[],
  ): Promise<CachedMatchScoreResult[]> {
    const inputHashes = [...new Set(inputs.map(({ inputHash }) => inputHash))];
    const stored = await this.prisma.matchScoreCache.findMany({
      where: { inputHash: { in: inputHashes } },
      select: {
        inputHash: true,
        score: true,
        confidence: true,
        matchedKeywords: true,
        missingKeywords: true,
        weakSections: true,
        breakdown: true,
        explanation: true,
      },
    });
    const storedByHash = new Map(stored.map((item) => [item.inputHash, item]));
    const calculatedByHash = new Map<string, MatchScoreResult>();

    const results = inputs.map(({ description, inputHash }) => {
      const cached = storedByHash.get(inputHash);
      if (cached) {
        return {
          score: cached.score,
          confidence: cached.confidence,
          matchedKeywords: cached.matchedKeywords,
          missingKeywords: cached.missingKeywords,
          weakSections: cached.weakSections,
          breakdown: cached.breakdown as unknown as MatchScoreBreakdown,
          explanation: cached.explanation,
          cached: true,
        };
      }

      let calculated = calculatedByHash.get(inputHash);
      if (!calculated) {
        calculated = calculateMatchScore(
          { content: resumeContent },
          description,
          'original CV',
        );
        calculatedByHash.set(inputHash, calculated);
      }
      return { ...calculated, cached: false };
    });

    if (calculatedByHash.size > 0) {
      await this.prisma.matchScoreCache.createMany({
        data: [...calculatedByHash].map(([inputHash, result]) => ({
          resumeId,
          inputHash,
          algorithmVersion: MATCH_SCORE_ALGORITHM_VERSION,
          score: result.score,
          confidence: result.confidence,
          matchedKeywords: result.matchedKeywords,
          missingKeywords: result.missingKeywords,
          weakSections: result.weakSections,
          breakdown:
            result.breakdown as unknown as Prisma.InputJsonValue,
          explanation: result.explanation,
        })),
        skipDuplicates: true,
      });
    }

    return results;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

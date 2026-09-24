import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ResumeParseExecutionStatus,
  ResumeParseFailureCategory,
  ResumeParseStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class ResumeOperationsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listFailures(input: { cursor?: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const rows = await this.prisma.resume.findMany({
      where: { parseStatus: ResumeParseStatus.failed },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      select: {
        id: true,
        parseStatus: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { parseExecutionClaims: true } },
        parseExecutionClaims: {
          orderBy: { claimedAt: 'desc' },
          take: 1,
          select: { attempt: true, claimedAt: true },
        },
        parseExecutions: {
          orderBy: { generation: 'desc' },
          take: 2,
          select: {
            generation: true,
            status: true,
            failureCategory: true,
            attemptCount: true,
          },
        },
      },
    });
    const page = rows.slice(0, limit);
    const last = page.length > 0 ? page[page.length - 1] : undefined;
    return {
      failures: page.map((row) => this.toFailure(row)),
      limit,
      nextCursor:
        rows.length > limit && last
          ? this.encodeCursor(last.updatedAt, last.id)
          : null,
    };
  }

  async getFailure(resumeId: string) {
    const row = await this.prisma.resume.findFirst({
      where: { id: resumeId, parseStatus: ResumeParseStatus.failed },
      select: {
        id: true,
        parseStatus: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { parseExecutionClaims: true } },
        parseExecutionClaims: {
          orderBy: { claimedAt: 'desc' },
          take: 1,
          select: { attempt: true, claimedAt: true },
        },
        parseExecutions: {
          orderBy: { generation: 'desc' },
          take: 2,
          select: {
            generation: true,
            status: true,
            failureCategory: true,
            attemptCount: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Resume processing failure not found');
    return this.toFailure(row);
  }

  private toFailure(row: {
    id: string;
    parseStatus: ResumeParseStatus;
    mimeType: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { parseExecutionClaims: number };
    parseExecutionClaims: Array<{ attempt: number; claimedAt: Date }>;
    parseExecutions: Array<{
      generation: number;
      status: ResumeParseExecutionStatus;
      failureCategory: ResumeParseFailureCategory | null;
      attemptCount: number;
    }>;
  }) {
    const lastClaim = row.parseExecutionClaims[0];
    const latestExecution = row.parseExecutions[0];
    const latestFailure = row.parseExecutions.find(
      (execution) =>
        execution.status ===
          ResumeParseExecutionStatus.failed_requeueable ||
        execution.status === ResumeParseExecutionStatus.failed_permanent,
    );
    const requeueable =
      latestExecution?.status ===
        ResumeParseExecutionStatus.failed_requeueable &&
      latestExecution.generation === 0;
    return {
      resumeId: row.id,
      status: row.parseStatus,
      failureCategory:
        latestFailure?.failureCategory ??
        ResumeParseFailureCategory.legacy_unclassified,
      requeueable,
      mimeType: row.mimeType,
      executionCount: row.parseExecutions.length
        ? row.parseExecutions.reduce(
            (total, execution) => total + execution.attemptCount,
            0,
          )
        : row._count.parseExecutionClaims,
      lastAttempt: latestExecution?.attemptCount ?? lastClaim?.attempt ?? null,
      lastAttemptAt: lastClaim?.claimedAt.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      failedAt: row.updatedAt.toISOString(),
    };
  }

  private encodeCursor(updatedAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ updatedAt: updatedAt.toISOString(), id }))
      .toString('base64url');
  }

  private decodeCursor(value: string): { updatedAt: Date; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        updatedAt?: unknown;
        id?: unknown;
      };
      const updatedAt = new Date(String(parsed.updatedAt));
      if (typeof parsed.id !== 'string' || !parsed.id || !Number.isFinite(updatedAt.getTime())) {
        throw new Error('invalid');
      }
      return { updatedAt, id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid resume-failures cursor');
    }
  }
}

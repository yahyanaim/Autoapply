import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ResumeParseExecutionStatus,
  ResumeParseFailureCategory,
  ResumeParseStatus,
  ResumeRequeueReason,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';

const MAX_ADMIN_GENERATION = 1;
const MAX_EXECUTION_ATTEMPTS = 3;

const REQUEUE_REASON_BY_FAILURE: Readonly<
  Partial<Record<ResumeParseFailureCategory, ResumeRequeueReason>>
> = {
  [ResumeParseFailureCategory.provider_transient]:
    ResumeRequeueReason.provider_recovered,
  [ResumeParseFailureCategory.storage_transient]:
    ResumeRequeueReason.storage_recovered,
  [ResumeParseFailureCategory.worker_crash]:
    ResumeRequeueReason.worker_recovery,
};

export interface ResumeRequeueResult {
  resumeId: string;
  requeueRequestId: string;
  status: 'requeue_requested';
  requestedAt: Date;
}

export class ResumeRequeueReplay extends Error {
  constructor() {
    super('Resume requeue request already exists');
    this.name = 'ResumeRequeueReplay';
  }
}

export class ResumeRequeuePersistenceConflict extends Error {
  constructor() {
    super('Resume requeue request conflicted');
    this.name = 'ResumeRequeuePersistenceConflict';
  }
}

@Injectable()
export class ResumeRequeueCommandService {
  constructor(private readonly prisma: PrismaService) {}

  async requestRequeueInTransaction(
    transaction: Prisma.TransactionClient,
    input: {
      resumeId: string;
      actorUserId: string;
      idempotencyKey: string;
      reason: ResumeRequeueReason;
    },
  ) {
    const idempotencyKeyHash = this.hash(input.idempotencyKey);
    const requestFingerprint = this.fingerprint(input);
    const replay = await transaction.resumeParseExecution.findUnique({
      where: {
        requestedByUserId_idempotencyKeyHash: {
          requestedByUserId: input.actorUserId,
          idempotencyKeyHash,
        },
      },
      select: { requestFingerprint: true },
    });
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) {
        throw new ConflictException(
          'The Idempotency-Key was already used for another request',
        );
      }
      // Throwing makes AdminMutationExecutor roll back proof consumption and
      // avoids writing a second audit event. The Admin boundary resolves the
      // already committed safe result through this owning service afterward.
      throw new ResumeRequeueReplay();
    }

    const existingSuccessor = await transaction.resumeParseExecution.findUnique({
      where: {
        resumeId_generation: {
          resumeId: input.resumeId,
          generation: MAX_ADMIN_GENERATION,
        },
      },
      select: { id: true },
    });
    if (existingSuccessor) {
      // The Admin boundary resolves this marker by the submitted durable
      // idempotency key. An exact duplicate returns the original result; a
      // different key receives the documented safe conflict.
      throw new ResumeRequeuePersistenceConflict();
    }

    const resume = await transaction.resume.findUnique({
      where: { id: input.resumeId },
      select: {
        id: true,
        parseStatus: true,
        user: { select: { dataProcessingConsentAt: true } },
        parseExecutions: {
          // Eligibility belongs to the immutable initial failure. A
          // concurrent winner may already have created generation 1 by the
          // time this statement runs; that successor must be resolved by the
          // existing generation/idempotency uniqueness constraints instead
          // of being re-evaluated as the failed target.
          where: { generation: 0 },
          take: 1,
          select: {
            id: true,
            generation: true,
            status: true,
            failureCategory: true,
            executionBoundary: true,
          },
        },
      },
    });
    if (!resume) throw new NotFoundException('Resume processing failure not found');
    if (!resume.user.dataProcessingConsentAt) {
      throw new ConflictException(
        'Resume requeue is not available in its current state',
      );
    }
    if (resume.parseStatus !== ResumeParseStatus.failed) {
      throw new ConflictException('Resume requeue is not available in its current state');
    }

    const failedExecution = resume.parseExecutions[0];
    if (
      !failedExecution ||
      failedExecution.status !== ResumeParseExecutionStatus.failed_requeueable ||
      failedExecution.failureCategory === null
    ) {
      throw new ConflictException('Resume processing failure is not requeueable');
    }
    if (failedExecution.generation >= MAX_ADMIN_GENERATION) {
      throw new ConflictException('Resume requeue limit reached');
    }
    const requiredReason = REQUEUE_REASON_BY_FAILURE[failedExecution.failureCategory];
    if (!requiredReason || input.reason !== requiredReason) {
      throw new ConflictException('Resume requeue reason does not match the failure');
    }
    if (
      failedExecution.executionBoundary !== 'free' &&
      failedExecution.executionBoundary !== 'paid'
    ) {
      throw new ConflictException('Resume processing boundary is invalid');
    }

    const generation = failedExecution.generation + 1;
    const queueName = `resume-parse-${failedExecution.executionBoundary}`;
    const queueJobId = `${queueName}-${resume.id}-g${generation}`;
    try {
      const execution = await transaction.resumeParseExecution.create({
        data: {
          resumeId: resume.id,
          predecessorExecutionId: failedExecution.id,
          generation,
          origin: 'admin_requeue',
          executionBoundary: failedExecution.executionBoundary,
          status: ResumeParseExecutionStatus.requeue_requested,
          maxAttempts: MAX_EXECUTION_ATTEMPTS,
          queueName,
          queueJobId,
          requestedByUserId: input.actorUserId,
          requeueReason: input.reason,
          idempotencyKeyHash,
          requestFingerprint,
          dispatch: { create: {} },
        },
        select: { id: true, requestedAt: true },
      });
      return {
        value: this.toResult(resume.id, execution.id, execution.requestedAt),
        before: {
          status: ResumeParseStatus.failed,
          failureCategory: failedExecution.failureCategory,
        },
        after: {
          status: ResumeParseExecutionStatus.requeue_requested,
          reason: input.reason,
        },
      };
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ResumeRequeuePersistenceConflict();
      }
      throw error;
    }
  }

  async resolveIdempotentResult(input: {
    resumeId: string;
    actorUserId: string;
    idempotencyKey: string;
    reason: ResumeRequeueReason;
  }): Promise<ResumeRequeueResult> {
    const record = await this.prisma.resumeParseExecution.findUnique({
      where: {
        requestedByUserId_idempotencyKeyHash: {
          requestedByUserId: input.actorUserId,
          idempotencyKeyHash: this.hash(input.idempotencyKey),
        },
      },
      select: {
        id: true,
        resumeId: true,
        requestedAt: true,
        requestFingerprint: true,
      },
    });
    if (!record || record.requestFingerprint !== this.fingerprint(input)) {
      throw new ConflictException('Resume requeue request conflicted');
    }
    return this.toResult(record.resumeId, record.id, record.requestedAt);
  }

  private toResult(
    resumeId: string,
    requeueRequestId: string,
    requestedAt: Date,
  ): ResumeRequeueResult {
    return {
      resumeId,
      requeueRequestId,
      status: 'requeue_requested',
      requestedAt,
    };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private fingerprint(input: {
    resumeId: string;
    actorUserId: string;
    reason: ResumeRequeueReason;
  }): string {
    return this.hash(
      JSON.stringify({
        actorUserId: input.actorUserId,
        reason: input.reason,
        resumeId: input.resumeId,
      }),
    );
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002') ||
      (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002')
    );
  }
}

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ResumeParseDispatchStatus,
  ResumeParseExecutionStatus,
  ResumeParseStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import { SystemClock } from '../../../../shared/adapters/system-clock.adapter';
import {
  safeErrorCategory,
  serializeSafeLog,
} from '../../../../shared/observability/safe-log';
import {
  ResumeParseFreeQueueToken,
  ResumeParseJobData,
  ResumeParseJobIdentity,
  ResumeParsePaidQueueToken,
} from '../../application/resume.service';
import { ResumeParseJobSignatureService } from './resume-parse-job-signature.service';

const DISPATCH_INTERVAL_MS = 2_000;
const DISPATCH_LEASE_MS = 30_000;
const MAX_DISPATCH_BATCH = 10;

@Injectable()
export class ResumeParseDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResumeParseDispatcher.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(ResumeParseFreeQueueToken) private readonly freeQueue: Queue,
    @Inject(ResumeParsePaidQueueToken) private readonly paidQueue: Queue,
    private readonly signatures: ResumeParseJobSignatureService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('APP_PROCESS_ROLE', 'all') === 'api') return;
    this.timer = setInterval(() => {
      void this.dispatchPending().catch((error) => {
        this.logger.error(
          serializeSafeLog({
            event: 'resume_requeue_dispatch_failed',
            component: 'resume_dispatcher',
            action: 'resume_requeue_dispatch',
            error,
          }),
        );
      });
    }, DISPATCH_INTERVAL_MS);
    this.timer.unref();
    void this.dispatchPending();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatchPending(limit = MAX_DISPATCH_BATCH): Promise<number> {
    const boundedLimit = Math.min(Math.max(limit, 1), MAX_DISPATCH_BATCH);
    let dispatched = 0;
    for (let index = 0; index < boundedLimit; index++) {
      const record = await this.claimNextDispatch();
      if (!record) break;
      if (await this.dispatch(record)) dispatched += 1;
    }
    return dispatched;
  }

  private supportedBoundaries(): string[] {
    const role = this.config.get<string>('AI_EXECUTION_ROLE', 'all');
    return role === 'free' ? ['free'] : role === 'paid' ? ['paid'] : ['free', 'paid'];
  }

  private async claimNextDispatch() {
    const now = this.clock.now();
    for (let race = 0; race < 3; race++) {
      const candidate = await this.prisma.resumeParseDispatch.findFirst({
        where: {
          execution: {
            executionBoundary: { in: this.supportedBoundaries() },
            status: {
              in: [
                ResumeParseExecutionStatus.requeue_requested,
                ResumeParseExecutionStatus.queued,
              ],
            },
          },
          OR: [
            {
              status: ResumeParseDispatchStatus.pending,
              availableAt: { lte: now },
            },
            {
              status: ResumeParseDispatchStatus.dispatching,
              leaseExpiresAt: { lte: now },
            },
          ],
        },
        orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
        select: { id: true, status: true, leaseExpiresAt: true },
      });
      if (!candidate) return null;
      const leaseExpiresAt = new Date(now.getTime() + DISPATCH_LEASE_MS);
      const claimed = await this.prisma.resumeParseDispatch.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          leaseExpiresAt: candidate.leaseExpiresAt,
        },
        data: {
          status: ResumeParseDispatchStatus.dispatching,
          leaseExpiresAt,
          attemptCount: { increment: 1 },
        },
      });
      if (claimed.count !== 1) continue;
      return this.prisma.resumeParseDispatch.findUniqueOrThrow({
        where: { id: candidate.id },
        select: {
          id: true,
          attemptCount: true,
          execution: {
            select: {
              id: true,
              resumeId: true,
              executionBoundary: true,
              queueJobId: true,
              resume: { select: { userId: true } },
            },
          },
        },
      });
    }
    return null;
  }

  private async dispatch(record: {
    id: string;
    attemptCount: number;
    execution: {
      id: string;
      resumeId: string;
      executionBoundary: string;
      queueJobId: string;
      resume: { userId: string };
    };
  }): Promise<boolean> {
    try {
      if (
        record.execution.executionBoundary !== 'free' &&
        record.execution.executionBoundary !== 'paid'
      ) {
        throw new Error('Invalid execution boundary');
      }
      const identity: ResumeParseJobIdentity = {
        resumeId: record.execution.resumeId,
        userId: record.execution.resume.userId,
        executionBoundary: record.execution.executionBoundary,
        jobId: record.execution.queueJobId,
      };
      const queue =
        identity.executionBoundary === 'free' ? this.freeQueue : this.paidQueue;
      await queue.add(
        'parse-resume',
        {
          ...identity,
          signature: this.signatures.sign(identity),
        } satisfies ResumeParseJobData,
        {
          jobId: identity.jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
      const now = this.clock.now();
      await this.prisma.$transaction(async (transaction) => {
        const queued = await transaction.resumeParseExecution.updateMany({
          where: {
            id: record.execution.id,
            status: ResumeParseExecutionStatus.requeue_requested,
          },
          data: {
            status: ResumeParseExecutionStatus.queued,
            queuedAt: now,
          },
        });
        if (queued.count === 1) {
          await transaction.resume.updateMany({
            where: {
              id: record.execution.resumeId,
              parseStatus: ResumeParseStatus.failed,
            },
            data: { parseStatus: ResumeParseStatus.pending, parseError: null },
          });
        }
        await transaction.resumeParseDispatch.update({
          where: { id: record.id },
          data: {
            status: ResumeParseDispatchStatus.dispatched,
            leaseExpiresAt: null,
            dispatchedAt: now,
            lastErrorCategory: null,
          },
        });
      });
      return true;
    } catch (error) {
      const delay = Math.min(
        15 * 60_000,
        2_000 * 2 ** Math.min(record.attemptCount - 1, 8),
      );
      await this.prisma.resumeParseDispatch.updateMany({
        where: {
          id: record.id,
          status: ResumeParseDispatchStatus.dispatching,
        },
        data: {
          status: ResumeParseDispatchStatus.pending,
          availableAt: new Date(this.clock.now().getTime() + delay),
          leaseExpiresAt: null,
          lastErrorCategory: safeErrorCategory(error),
        },
      });
      this.logger.error(
        serializeSafeLog({
          event: 'resume_requeue_dispatch_failed',
          component: 'resume_dispatcher',
          action: 'resume_requeue_dispatch',
          attempt: Math.min(record.attemptCount, 100),
          error,
        }),
      );
      return false;
    }
  }
}

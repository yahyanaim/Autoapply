import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import {
  ResumeParseQueueToken,
  ResumeParseDeadLetterQueueToken,
  ResumeService,
} from '../../application/resume.service';
import { UnrecoverableResumeParseError } from '../parsers/resume-parser';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import { ActivityType, Prisma } from '@prisma/client';
import { SystemClock } from '../../../../shared/adapters/system-clock.adapter';

@Injectable()
export class ResumeParseWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResumeParseWorker.name);
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly resumeService: ResumeService,
    @Inject(ResumeParseQueueToken) private readonly queue: Queue,
    @Inject(ResumeParseDeadLetterQueueToken)
    private readonly deadLetterQueue: Queue,
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  onModuleInit() {
    const url = new URL(
      this.configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
    this.worker = new Worker(
      'resume-parse',
      async (job) => {
        const resumeId = String(job.data.resumeId);
        const userId =
          typeof job.data.userId === 'string' ? job.data.userId : undefined;
        await this.writeActivity(userId, {
          event: 'resume_parse_started',
          jobId: job.id,
          resumeId,
          attempt: job.attemptsMade + 1,
        });
        try {
          const result = await this.resumeService.parse(resumeId);
          await this.writeActivity(userId, {
            event: 'resume_parse_completed',
            jobId: job.id,
            resumeId,
            attempt: job.attemptsMade + 1,
          });
          return result;
        } catch (error) {
          const unrecoverable =
            error instanceof UnrecoverableResumeParseError ||
            error instanceof ForbiddenException ||
            error instanceof NotFoundException;
          const attempts = job.opts.attempts ?? 1;
          if (unrecoverable || job.attemptsMade + 1 >= attempts) {
            await this.resumeService.markParseFailed(resumeId);
          }
          await this.writeActivity(userId, {
            event: 'resume_parse_failed',
            jobId: job.id,
            resumeId,
            attempt: job.attemptsMade + 1,
            terminal: unrecoverable || job.attemptsMade + 1 >= attempts,
            error:
              error instanceof Error ? error.message : 'Unknown parsing error',
          });
          if (unrecoverable) {
            throw new UnrecoverableError(
              error instanceof Error ? error.message : 'Resume parsing cannot be retried',
            );
          }
          throw error;
        }
      },
      {
        connection: {
          host: url.hostname,
          port: Number(url.port || 6379),
          username: url.username || undefined,
          password: url.password || undefined,
          tls: url.protocol === 'rediss:' ? {} : undefined,
        },
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Resume parse job ${job?.id ?? 'unknown'} failed: ${error.message}`);
      if (job && this.isTerminalFailure(job, error)) {
        void this.routeToDeadLetter(job, error).catch((deadLetterError) => {
          this.logger.error(
            `Could not route resume parse job ${job.id ?? 'unknown'} to the dead-letter queue: ${
              deadLetterError instanceof Error
                ? deadLetterError.message
                : String(deadLetterError)
            }`,
          );
        });
      }
    });
    this.worker.on('error', (error) => {
      this.logger.error(`Resume parse worker error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await Promise.all([
      this.worker?.close(),
      this.queue.close(),
      this.deadLetterQueue.close(),
    ]);
  }

  async routeToDeadLetter(job: Job, error: Error): Promise<void> {
    const originalJobId = String(job.id ?? 'unknown');
    await this.deadLetterQueue.add(
      'failed-resume-parse',
      {
        originalJobId,
        originalQueue: 'resume-parse',
        originalData: job.data,
        attemptsMade: job.attemptsMade,
        failedReason: error.message,
        failedAt: this.clock.now().toISOString(),
      },
      {
        jobId: `resume-parse-dlq-${originalJobId}`,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }

  private isTerminalFailure(job: Job, error: Error): boolean {
    return (
      error.name === 'UnrecoverableError' ||
      job.attemptsMade >= (job.opts.attempts ?? 1)
    );
  }

  private async writeActivity(
    userId: string | undefined,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.activityLog.create({
      data: {
        userId,
        type: ActivityType.queue_job,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}

import {
  ForbiddenException,
  HttpException,
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
  ResumeParseFreeQueueToken,
  ResumeParseJobData,
  ResumeParsePaidQueueToken,
  ResumeParseDeadLetterQueueToken,
  ResumeService,
  resumeParseQueueName,
} from '../../application/resume.service';
import { ResumeParseJobSignatureService } from './resume-parse-job-signature.service';
import { UnrecoverableResumeParseError } from '../parsers/resume-parser';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import { ActivityType, Prisma, ResumeParseStatus } from '@prisma/client';
import { SystemClock } from '../../../../shared/adapters/system-clock.adapter';
import {
  safeErrorCategory,
  serializeSafeLog,
} from '../../../../shared/observability/safe-log';
import {
  AiExecutionBoundary,
  PlanAwareAiRouter,
} from '../../../ai/application/plan-aware-ai.router';

const legacyResumeParseQueueName = 'resume-parse';

@Injectable()
export class ResumeParseWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResumeParseWorker.name);
  private readonly workers: Worker[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly resumeService: ResumeService,
    @Inject(ResumeParseFreeQueueToken) private readonly freeQueue: Queue,
    @Inject(ResumeParsePaidQueueToken) private readonly paidQueue: Queue,
    @Inject(ResumeParseDeadLetterQueueToken)
    private readonly deadLetterQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly planAwareRouter: PlanAwareAiRouter,
    private readonly jobSignature: ResumeParseJobSignatureService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  onModuleInit() {
    const processRole = this.configService.get<string>(
      'APP_PROCESS_ROLE',
      'all',
    );
    if (processRole === 'api') {
      return;
    }
    const url = new URL(
      this.configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
    if (
      this.configService.get<boolean>(
        'RESUME_PARSE_LEGACY_DRAIN_ENABLED',
        false,
      )
    ) {
      // This maintenance mode never reads a document or resolves an
      // entitlement. It accepts the legacy queue only to safely quarantine its
      // unsigned payloads, then exits without starting executable workers.
      if (processRole === 'worker') {
        this.startLegacyDrainWorker(url);
      }
      return;
    }
    const executionRole = this.configService.get<string>(
      'AI_EXECUTION_ROLE',
      'all',
    );
    const boundaries: AiExecutionBoundary[] =
      executionRole === 'free'
        ? ['free']
        : executionRole === 'paid'
          ? ['paid']
          : ['free', 'paid'];
    for (const boundary of boundaries) {
      this.startWorker(boundary, url);
    }
  }

  private startWorker(boundary: AiExecutionBoundary, url: URL): void {
    const queueName = resumeParseQueueName(boundary);
    const worker = new Worker(
      queueName,
      async (job) => this.processJob(boundary, job),
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
    this.workers.push(worker);
    this.attachWorkerEvents(worker, queueName);
  }

  private startLegacyDrainWorker(url: URL): void {
    const worker = new Worker(
      legacyResumeParseQueueName,
      async (job) => this.quarantineLegacyJob(job),
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
    this.workers.push(worker);
    this.attachWorkerEvents(worker, legacyResumeParseQueueName, true);
  }

  private attachWorkerEvents(
    worker: Worker,
    queueName: string,
    legacy = false,
  ): void {
    worker.on('failed', (job, error) => {
      this.logger.error(
        serializeSafeLog({
          event: 'resume_parse_failed',
          component: 'resume_worker',
          action: 'resume_parse',
          attempt: job?.attemptsMade,
          error,
        }),
      );
      if (job && this.isTerminalFailure(job, error)) {
        void this.routeToDeadLetter(job, error, queueName, legacy).catch(
          (deadLetterError) => {
            this.logger.error(
              serializeSafeLog({
                event: 'resume_parse_dead_letter_failed',
                component: 'resume_worker',
                action: 'resume_parse',
                error: deadLetterError,
              }),
            );
          },
        );
      }
    });
    worker.on('error', (error) => {
      this.logger.error(
        serializeSafeLog({
          event: 'resume_parse_worker_failed',
          component: 'resume_worker',
          action: 'resume_parse',
          error,
        }),
      );
    });
  }

  private async processJob(boundary: AiExecutionBoundary, job: Job) {
    const payload = job.data as Partial<ResumeParseJobData>;
    const resumeId =
      typeof payload.resumeId === 'string' ? payload.resumeId : undefined;
    const userId = typeof payload.userId === 'string' ? payload.userId : undefined;
    const signature =
      typeof payload.signature === 'string' ? payload.signature : undefined;
    const jobId = typeof payload.jobId === 'string' ? payload.jobId : undefined;
    const actualJobId =
      job.id === undefined || job.id === null ? undefined : String(job.id);
    if (
      !resumeId ||
      !userId ||
      !signature ||
      !jobId ||
      !actualJobId ||
      jobId !== actualJobId ||
      payload.executionBoundary !== boundary
    ) {
      // A payload copied to the wrong queue, or manually altered in Redis,
      // must never reach a parser or provider.
      throw new UnrecoverableError('Invalid resume parse job');
    }

    const signedPayload: ResumeParseJobData = {
      resumeId,
      userId,
      executionBoundary: boundary,
      jobId,
      signature,
    };
    if (!this.jobSignature.verify(signedPayload)) {
      throw new UnrecoverableError('Invalid resume parse job');
    }

    let ownedResume;
    try {
      // Queue payloads are server generated, but the worker still confirms
      // ownership before touching storage or invoking the parser. This keeps a
      // manually altered resumeId from operating on another tenant's document.
      ownedResume = await this.resumeService.getResume(userId, resumeId);
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw new UnrecoverableError('Resume job does not match its owner');
      }
      throw error;
    }
    if (
      ownedResume.parseStatus === ResumeParseStatus.ready &&
      ownedResume.parsedJson
    ) {
      return ownedResume;
    }

    const currentAttempt = job.attemptsMade + 1;
    const claimed = await this.claimExecution(
      resumeId,
      resumeParseQueueName(boundary),
      jobId,
      currentAttempt,
    );
    if (!claimed) {
      // Do not route a duplicate delivery through the generic parse failure
      // path: it must not mutate resume state or consume a retry.
      throw new UnrecoverableError('Resume parse job was already claimed');
    }

    let route;
    try {
      route = await this.planAwareRouter.resolve(userId);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        await this.failEntitlementChangedJob(userId, resumeId, boundary, job);
      }
      throw error;
    }
    if (route.boundary !== boundary) {
      await this.failEntitlementChangedJob(userId, resumeId, boundary, job);
    }

    await this.writeActivity(userId, {
      event: 'resume_parse_started',
      jobId: job.id,
      resumeId,
      boundary,
      attempt: job.attemptsMade + 1,
    });
    try {
      const result = await this.resumeService.parse(resumeId, boundary);
      await this.writeActivity(userId, {
        event: 'resume_parse_completed',
        jobId: job.id,
        resumeId,
        boundary,
        attempt: job.attemptsMade + 1,
      });
      return result;
    } catch (error) {
      const unrecoverable =
        error instanceof UnrecoverableResumeParseError ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException;
      const attempts = job.opts.attempts ?? 1;
      const retryAuthorized =
        !unrecoverable &&
        this.isRetryableFailure(error) &&
        currentAttempt < attempts &&
        (await this.authorizeRetry(
          resumeParseQueueName(boundary),
          jobId,
          currentAttempt,
        ));
      const terminal = unrecoverable || !retryAuthorized;
      if (terminal) {
        await this.resumeService.markParseFailed(resumeId);
      }
      await this.writeActivity(userId, {
        event: 'resume_parse_failed',
        jobId: job.id,
        resumeId,
        boundary,
        attempt: currentAttempt,
        terminal,
        errorCategory: safeErrorCategory(error),
      });
      if (unrecoverable) {
        throw new UnrecoverableError('Resume parsing cannot be retried');
      }
      if (!retryAuthorized) {
        throw new UnrecoverableError('Resume parsing retry was not authorized');
      }
      // BullMQ persists failure messages in Redis. Do not let a provider,
      // parser, or storage error carry user-controlled content there. The
      // durable authorization above is consumed atomically by the next
      // delivery; changing attemptsMade alone cannot create another AI call.
      throw new Error('Resume parsing failed');
    }
  }

  async onModuleDestroy() {
    // BullMQ's close waits for active jobs and stops fetching new ones, which
    // lets container shutdown drain safely without accepting more work.
    await Promise.all([
      ...this.workers.map((worker) => worker.close()),
      this.freeQueue.close(),
      this.paidQueue.close(),
      this.deadLetterQueue.close(),
    ]);
  }

  async routeToDeadLetter(
    job: Job,
    error: Error,
    originalQueue: string,
    legacy = false,
  ): Promise<void> {
    const originalJobId = String(job.id ?? 'unknown');
    await this.deadLetterQueue.add(
      'failed-resume-parse',
      {
        originalJobId,
        originalQueue,
        attemptsMade: job.attemptsMade,
        failureCategory: safeErrorCategory(error),
        failedAt: this.clock.now().toISOString(),
        ...(legacy ? { legacy: true } : {}),
      },
      {
        jobId: `resume-parse-dlq-${originalJobId}`,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }

  private async quarantineLegacyJob(job: Job): Promise<void> {
    // Legacy queue data has no signature. Do not deserialize, inspect, log,
    // re-sign, re-queue, look up, or execute it. The retained DLQ entry has
    // only operational metadata and lets an operator account for the drain.
    await this.routeToDeadLetter(
      job,
      new UnrecoverableError('Legacy resume parse job quarantined'),
      legacyResumeParseQueueName,
      true,
    );
  }

  private async claimExecution(
    resumeId: string,
    queueName: string,
    jobId: string,
    attempt: number,
  ): Promise<boolean> {
    try {
      await this.prisma.resumeParseExecutionClaim.create({
        data: { resumeId, queueName, jobId, attempt },
      });
      return true;
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      // A later BullMQ delivery is admitted only when the prior, real failure
      // recorded an authorization for this exact next attempt. A copied signed
      // payload cannot manufacture that authorization by altering attemptsMade.
      const consumedAuthorization =
        await this.prisma.resumeParseExecutionClaim.updateMany({
          where: {
            queueName,
            jobId,
            attempt: attempt - 1,
            retryAuthorizedAttempt: attempt,
          },
          data: { attempt, retryAuthorizedAttempt: null },
        });
      return consumedAuthorization.count === 1;
    }
  }

  private async authorizeRetry(
    queueName: string,
    jobId: string,
    attempt: number,
  ): Promise<boolean> {
    const authorized = await this.prisma.resumeParseExecutionClaim.updateMany({
      where: {
        queueName,
        jobId,
        attempt,
        retryAuthorizedAttempt: null,
      },
      data: { retryAuthorizedAttempt: attempt + 1 },
    });
    return authorized.count === 1;
  }

  private isRetryableFailure(error: unknown): boolean {
    if (
      error instanceof UnrecoverableResumeParseError ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    ) {
      return false;
    }
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        return (response as { retryable?: unknown }).retryable === true;
      }
      return error.getStatus() >= 500;
    }
    return true;
  }

  private async failEntitlementChangedJob(
    userId: string,
    resumeId: string,
    boundary: AiExecutionBoundary,
    job: Job,
  ): Promise<never> {
    await this.resumeService.markParseFailed(resumeId);
    await this.writeActivity(userId, {
      event: 'resume_parse_failed',
      jobId: job.id,
      resumeId,
      boundary,
      attempt: job.attemptsMade + 1,
      terminal: true,
      errorCategory: 'http_4xx',
    });
    throw new UnrecoverableError('Resume job entitlement no longer matches');
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

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002')
  );
}

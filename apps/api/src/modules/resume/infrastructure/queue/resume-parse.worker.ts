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
  ResumeParseExecutionFence,
  ResumeService,
  resumeParseQueueName,
} from '../../application/resume.service';
import { ResumeParseJobSignatureService } from './resume-parse-job-signature.service';
import {
  RetryableResumeParseError,
  StaleResumeParseExecutionError,
  UnrecoverableResumeParseError,
} from '../parsers/resume-parser';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import {
  ActivityType,
  Prisma,
  ResumeParseExecutionOrigin,
  ResumeParseExecutionStatus,
  ResumeParseFailureCategory,
  ResumeParseStatus,
} from '@prisma/client';
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
const EXECUTION_LEASE_MS = 5 * 60_000;
const EXECUTION_HEARTBEAT_MS = 60_000;

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
        lockDuration: EXECUTION_LEASE_MS,
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
        void this.handleTerminalFailure(job, error, queueName, legacy).catch(
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

    const execution = await this.ensureExecution(
      resumeId,
      boundary,
      jobId,
      job.opts.attempts ?? 3,
    );
    if (
      execution.status === ResumeParseExecutionStatus.succeeded ||
      execution.status === ResumeParseExecutionStatus.failed_permanent ||
      execution.status === ResumeParseExecutionStatus.failed_requeueable
    ) {
      throw new UnrecoverableError('Resume parse execution is already terminal');
    }

    const currentAttempt = job.attemptsMade + 1;
    const maxAttempts = Math.min(Math.max(execution.maxAttempts, 1), 3);
    if (currentAttempt > maxAttempts) {
      throw new UnrecoverableError('Resume parse execution limit reached');
    }
    const fence = await this.claimExecution(
      resumeId,
      resumeParseQueueName(boundary),
      jobId,
      currentAttempt,
      execution.id,
    );
    if (!fence) {
      // Do not route a duplicate delivery through the generic parse failure
      // path: it must not mutate resume state or consume a retry.
      throw new UnrecoverableError('Resume parse job was already claimed');
    }

    let route;
    try {
      route = await this.planAwareRouter.resolve(userId);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        await this.failEntitlementChangedJob(
          userId,
          resumeId,
          boundary,
          job,
          fence,
        );
      }
      throw error;
    }
    if (route.boundary !== boundary) {
      await this.failEntitlementChangedJob(
        userId,
        resumeId,
        boundary,
        job,
        fence,
      );
    }

    await this.writeActivity(userId, {
      event: 'resume_parse_started',
      jobId: job.id,
      resumeId,
      boundary,
      attempt: job.attemptsMade + 1,
    });
    try {
      const result = await this.withLeaseHeartbeat(fence, () =>
        this.resumeService.parse(resumeId, boundary, fence),
      );
      await this.writeActivity(userId, {
        event: 'resume_parse_completed',
        jobId: job.id,
        resumeId,
        boundary,
        attempt: job.attemptsMade + 1,
      });
      return result;
    } catch (error) {
      if (error instanceof StaleResumeParseExecutionError) {
        throw new UnrecoverableError('Resume parse execution lease was superseded');
      }
      const unrecoverable =
        error instanceof UnrecoverableResumeParseError ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException;
      const attempts = maxAttempts;
      const retryAuthorized =
        !unrecoverable &&
        this.isRetryableFailure(error) &&
        currentAttempt < attempts &&
        (await this.authorizeRetry(
          resumeParseQueueName(boundary),
          jobId,
          currentAttempt,
          fence,
        ));
      const terminal = unrecoverable || !retryAuthorized;
      if (terminal) {
        await this.markExecutionFailed(
          resumeId,
          fence,
          this.failureCategory(error),
        );
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

  private async handleTerminalFailure(
    job: Job,
    error: Error,
    queueName: string,
    legacy: boolean,
  ): Promise<void> {
    if (!legacy) {
      try {
        await this.markTerminalWorkerCrash(job, queueName);
      } catch (crashClassificationError) {
        this.logger.error(
          serializeSafeLog({
            event: 'resume_parse_crash_classification_failed',
            component: 'resume_worker',
            action: 'resume_parse',
            error: crashClassificationError,
          }),
        );
      }
    }
    await this.routeToDeadLetter(job, error, queueName, legacy);
  }

  private async markTerminalWorkerCrash(
    job: Job,
    queueName: string,
  ): Promise<void> {
    const jobId = job.id === undefined || job.id === null ? null : String(job.id);
    if (!jobId) return;
    const now = this.clock.now();
    await this.prisma.$transaction(async (transaction) => {
      const execution = await transaction.resumeParseExecution.findUnique({
        where: { queueJobId: jobId },
        select: {
          id: true,
          resumeId: true,
          status: true,
          claim: {
            select: {
              id: true,
              queueName: true,
              leaseVersion: true,
              leaseExpiresAt: true,
            },
          },
        },
      });
      if (
        !execution?.claim ||
        execution.claim.queueName !== queueName ||
        !execution.claim.leaseExpiresAt ||
        execution.claim.leaseExpiresAt > now ||
        (execution.status !== ResumeParseExecutionStatus.processing &&
          execution.status !== ResumeParseExecutionStatus.retrying)
      ) {
        return;
      }
      const released =
        await transaction.resumeParseExecutionClaim.updateMany({
          where: {
            id: execution.claim.id,
            executionId: execution.id,
            leaseVersion: execution.claim.leaseVersion,
            leaseExpiresAt: { lte: now },
          },
          data: { leaseExpiresAt: null, retryAuthorizedAttempt: null },
        });
      if (released.count !== 1) return;
      const failed = await transaction.resumeParseExecution.updateMany({
        where: {
          id: execution.id,
          status: {
            in: [
              ResumeParseExecutionStatus.processing,
              ResumeParseExecutionStatus.retrying,
            ],
          },
        },
        data: {
          status: ResumeParseExecutionStatus.failed_requeueable,
          failureCategory: ResumeParseFailureCategory.worker_crash,
          failedAt: now,
        },
      });
      if (failed.count !== 1) return;
      await transaction.resume.updateMany({
        where: { id: execution.resumeId },
        data: {
          parseStatus: ResumeParseStatus.failed,
          parseError:
            'Resume parsing failed. Check the file and AI provider configuration, then upload it again.',
        },
      });
    });
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
    executionId: string,
  ): Promise<ResumeParseExecutionFence | null> {
    let claim = await this.prisma.resumeParseExecutionClaim.findUnique({
      where: { queueName_jobId: { queueName, jobId } },
      select: {
        id: true,
        attempt: true,
        retryAuthorizedAttempt: true,
        leaseVersion: true,
        leaseExpiresAt: true,
        executionId: true,
      },
    });
    if (!claim) {
      try {
        claim = await this.prisma.resumeParseExecutionClaim.create({
          data: {
            resumeId,
            executionId,
            queueName,
            jobId,
            attempt,
          },
          select: {
            id: true,
            attempt: true,
            retryAuthorizedAttempt: true,
            leaseVersion: true,
            leaseExpiresAt: true,
            executionId: true,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) throw error;
        claim = await this.prisma.resumeParseExecutionClaim.findUnique({
          where: { queueName_jobId: { queueName, jobId } },
          select: {
            id: true,
            attempt: true,
            retryAuthorizedAttempt: true,
            leaseVersion: true,
            leaseExpiresAt: true,
            executionId: true,
          },
        });
      }
    }
    if (!claim || (claim.executionId && claim.executionId !== executionId)) {
      return null;
    }

    const now = this.clock.now();
    const isSameAttemptRecovery =
      claim.attempt === attempt &&
      (!claim.leaseExpiresAt || claim.leaseExpiresAt <= now);
    const isAuthorizedRetry =
      claim.attempt === attempt - 1 &&
      claim.retryAuthorizedAttempt === attempt;
    if (!isSameAttemptRecovery && !isAuthorizedRetry) return null;

    const nextLeaseVersion = claim.leaseVersion + 1;
    const leaseExpiresAt = new Date(now.getTime() + EXECUTION_LEASE_MS);
    const claimed = await this.prisma.$transaction(async (transaction) => {
      const updatedClaim =
        await transaction.resumeParseExecutionClaim.updateMany({
          where: {
            id: claim!.id,
            executionId: claim!.executionId,
            attempt: claim!.attempt,
            leaseVersion: claim!.leaseVersion,
            ...(isSameAttemptRecovery
              ? {
                  OR: [
                    { leaseExpiresAt: null },
                    { leaseExpiresAt: { lte: now } },
                  ],
                }
              : { retryAuthorizedAttempt: attempt }),
          },
          data: {
            attempt,
            executionId,
            retryAuthorizedAttempt: null,
            leaseVersion: nextLeaseVersion,
            leaseExpiresAt,
            claimedAt: now,
          },
        });
      if (updatedClaim.count !== 1) return false;
      const updatedExecution = await transaction.resumeParseExecution.updateMany({
        where: {
          id: executionId,
          status: {
            in: [
              ResumeParseExecutionStatus.requeue_requested,
              ResumeParseExecutionStatus.queued,
              ResumeParseExecutionStatus.processing,
              ResumeParseExecutionStatus.retrying,
            ],
          },
          attemptCount: { lte: 3 },
        },
        data: {
          status: ResumeParseExecutionStatus.processing,
          attemptCount: Math.max(attempt, 1),
          startedAt: now,
          failureCategory: null,
        },
      });
      if (updatedExecution.count !== 1) {
        throw new UnrecoverableError('Resume parse execution limit reached');
      }
      await transaction.resume.updateMany({
        where: { id: resumeId },
        data: { parseStatus: ResumeParseStatus.processing, parseError: null },
      });
      return true;
    });
    return claimed
      ? { executionId, claimId: claim.id, leaseVersion: nextLeaseVersion }
      : null;
  }

  private async authorizeRetry(
    queueName: string,
    jobId: string,
    attempt: number,
    fence: ResumeParseExecutionFence,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const authorized =
        await transaction.resumeParseExecutionClaim.updateMany({
          where: {
            id: fence.claimId,
            executionId: fence.executionId,
            queueName,
            jobId,
            attempt,
            leaseVersion: fence.leaseVersion,
            retryAuthorizedAttempt: null,
            leaseExpiresAt: { gt: this.clock.now() },
          },
          data: {
            retryAuthorizedAttempt: attempt + 1,
            leaseExpiresAt: null,
          },
        });
      if (authorized.count !== 1) return false;
      const retrying = await transaction.resumeParseExecution.updateMany({
        where: {
          id: fence.executionId,
          status: ResumeParseExecutionStatus.processing,
        },
        data: { status: ResumeParseExecutionStatus.retrying },
      });
      return retrying.count === 1;
    });
  }

  private isRetryableFailure(error: unknown): boolean {
    if (
      error instanceof UnrecoverableResumeParseError ||
      error instanceof StaleResumeParseExecutionError ||
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
    fence: ResumeParseExecutionFence,
  ): Promise<never> {
    await this.markExecutionFailed(
      resumeId,
      fence,
      ResumeParseFailureCategory.entitlement_changed,
    );
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

  private async ensureExecution(
    resumeId: string,
    boundary: AiExecutionBoundary,
    jobId: string,
    maxAttempts: number,
  ) {
    const existing = await this.prisma.resumeParseExecution.findUnique({
      where: { queueJobId: jobId },
    });
    if (existing) {
      if (
        existing.resumeId !== resumeId ||
        existing.executionBoundary !== boundary
      ) {
        throw new UnrecoverableError('Resume parse execution identity mismatch');
      }
      return existing;
    }
    try {
      return await this.prisma.resumeParseExecution.create({
        data: {
          resumeId,
          generation: 0,
          origin: ResumeParseExecutionOrigin.initial,
          executionBoundary: boundary,
          status: ResumeParseExecutionStatus.queued,
          maxAttempts: Math.min(Math.max(maxAttempts, 1), 3),
          queueName: resumeParseQueueName(boundary),
          queueJobId: jobId,
          queuedAt: this.clock.now(),
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const raced = await this.prisma.resumeParseExecution.findUnique({
        where: { queueJobId: jobId },
      });
      if (!raced) throw error;
      return raced;
    }
  }

  private async withLeaseHeartbeat<T>(
    fence: ResumeParseExecutionFence,
    operation: () => Promise<T>,
  ): Promise<T> {
    const heartbeat = setInterval(() => {
      const now = this.clock.now();
      void this.prisma.resumeParseExecutionClaim
        .updateMany({
          where: {
            id: fence.claimId,
            executionId: fence.executionId,
            leaseVersion: fence.leaseVersion,
            leaseExpiresAt: { gt: now },
          },
          data: {
            leaseExpiresAt: new Date(now.getTime() + EXECUTION_LEASE_MS),
          },
        })
        .catch((error) => {
          this.logger.error(
            serializeSafeLog({
              event: 'resume_parse_lease_heartbeat_failed',
              component: 'resume_worker',
              action: 'resume_parse',
              error,
            }),
          );
        });
    }, EXECUTION_HEARTBEAT_MS);
    heartbeat.unref();
    try {
      return await operation();
    } finally {
      clearInterval(heartbeat);
    }
  }

  private failureCategory(error: unknown): ResumeParseFailureCategory {
    if (
      error instanceof UnrecoverableResumeParseError ||
      error instanceof RetryableResumeParseError
    ) {
      return error.category;
    }
    if (error instanceof ForbiddenException) {
      return ResumeParseFailureCategory.authorization;
    }
    if (error instanceof NotFoundException) {
      return ResumeParseFailureCategory.record_missing;
    }
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (
        typeof response === 'object' &&
        response !== null &&
        (response as { retryable?: unknown }).retryable === true
      ) {
        return ResumeParseFailureCategory.provider_transient;
      }
      return ResumeParseFailureCategory.provider_configuration;
    }
    return ResumeParseFailureCategory.internal_unknown;
  }

  private async markExecutionFailed(
    resumeId: string,
    fence: ResumeParseExecutionFence,
    failureCategory: ResumeParseFailureCategory,
  ): Promise<void> {
    const requeueable = new Set<ResumeParseFailureCategory>([
      ResumeParseFailureCategory.provider_transient,
      ResumeParseFailureCategory.storage_transient,
      ResumeParseFailureCategory.worker_crash,
    ]).has(failureCategory);
    await this.prisma.$transaction(async (transaction) => {
      const released =
        await transaction.resumeParseExecutionClaim.updateMany({
          where: {
            id: fence.claimId,
            executionId: fence.executionId,
            leaseVersion: fence.leaseVersion,
            leaseExpiresAt: { gt: this.clock.now() },
          },
          data: { leaseExpiresAt: null, retryAuthorizedAttempt: null },
        });
      if (released.count !== 1) return;
      const failed = await transaction.resumeParseExecution.updateMany({
        where: {
          id: fence.executionId,
          status: ResumeParseExecutionStatus.processing,
        },
        data: {
          status: requeueable
            ? ResumeParseExecutionStatus.failed_requeueable
            : ResumeParseExecutionStatus.failed_permanent,
          failureCategory,
          failedAt: this.clock.now(),
        },
      });
      if (failed.count !== 1) return;
      await transaction.resume.updateMany({
        where: { id: resumeId },
        data: {
          parseStatus: ResumeParseStatus.failed,
          parseError:
            'Resume parsing failed. Check the file and AI provider configuration, then upload it again.',
        },
      });
    });
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

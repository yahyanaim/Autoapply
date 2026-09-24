import {
  ResumeParseExecutionOrigin,
  ResumeParseExecutionStatus,
  ResumeParseFailureCategory,
  ResumeParseStatus,
  ResumeRequeueReason,
  UserRole,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../src/database/prisma/prisma.service';
import {
  ResumeRequeueCommandService,
  ResumeRequeuePersistenceConflict,
  ResumeRequeueReplay,
} from '../src/modules/resume/application/resume-requeue-command.service';
import { ResumeParseDispatcher } from '../src/modules/resume/infrastructure/queue/resume-parse-dispatcher.service';
import { ResumeParseJobSignatureService } from '../src/modules/resume/infrastructure/queue/resume-parse-job-signature.service';

const runId = `admin-resume-requeue-${process.pid}-${Date.now()}`;
const LOOPBACK_REDIS_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function requireLoopbackRedisUrl(value: string | undefined): URL {
  let redis: URL;
  try {
    redis = new URL(value ?? '');
  } catch {
    throw new Error('Integration tests require an isolated loopback REDIS_URL');
  }
  const hostname = redis.hostname.replace(/^\[|\]$/g, '');
  if (redis.protocol !== 'redis:' || !LOOPBACK_REDIS_HOSTS.has(hostname)) {
    throw new Error('Integration tests require an isolated loopback REDIS_URL');
  }
  return redis;
}

describe('Admin resume requeue Redis URL validation', () => {
  it.each([
    'redis://localhost:6379',
    'redis://127.0.0.1:6380',
    'redis://[::1]:6379',
  ])(
    'accepts the loopback integration URL %s',
    (redisUrl) => {
      expect(requireLoopbackRedisUrl(redisUrl)).toBeInstanceOf(URL);
    },
  );

  it('rejects a non-loopback Redis host', () => {
    expect(() =>
      requireLoopbackRedisUrl('redis://cache.example.test:6379'),
    ).toThrow('Integration tests require an isolated loopback REDIS_URL');
  });
});

describe('Resume-owned Admin requeue PostgreSQL and Redis integration', () => {
  let prisma: PrismaService;
  let command: ResumeRequeueCommandService;
  let freeQueue: Queue;
  let paidQueue: Queue;
  let actorUserId: string;
  let resumeId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'Integration tests require an isolated DATABASE_URL containing "test"',
      );
    }
    const redis = requireLoopbackRedisUrl(process.env.REDIS_URL);
    prisma = new PrismaService();
    await prisma.$connect();
    command = new ResumeRequeueCommandService(prisma);

    const connection = {
      host: redis.hostname.replace(/^\[|\]$/g, ''),
      port: Number(redis.port || 6379),
      username: redis.username || undefined,
      password: redis.password || undefined,
    };
    freeQueue = new Queue('resume-parse-free', { connection });
    paidQueue = new Queue('resume-parse-paid', { connection });
    await Promise.all([freeQueue.waitUntilReady(), paidQueue.waitUntilReady()]);

    const actor = await prisma.user.create({
      data: {
        email: `${runId}-admin@example.test`,
        role: UserRole.platform_admin,
      },
    });
    actorUserId = actor.id;
    const owner = await prisma.user.create({
      data: {
        email: `${runId}-owner@example.test`,
        dataProcessingConsentAt: new Date(),
      },
    });
    const resume = await prisma.resume.create({
      data: {
        userId: owner.id,
        originalFileUrl: `/isolated/${runId}.pdf`,
        mimeType: 'application/pdf',
        parseStatus: ResumeParseStatus.failed,
        parseError: 'sanitized failure',
        parseExecutions: {
          create: {
            generation: 0,
            origin: ResumeParseExecutionOrigin.initial,
            executionBoundary: 'free',
            status: ResumeParseExecutionStatus.failed_requeueable,
            failureCategory: ResumeParseFailureCategory.provider_transient,
            attemptCount: 3,
            maxAttempts: 3,
            queueName: 'resume-parse-free',
            queueJobId: `${runId}-initial`,
            failedAt: new Date(),
          },
        },
      },
    });
    resumeId = resume.id;
  });

  afterAll(async () => {
    const execution = await prisma?.resumeParseExecution.findFirst({
      where: { resumeId, generation: 1 },
      select: { queueJobId: true },
    });
    if (execution) await (await freeQueue?.getJob(execution.queueJobId))?.remove();
    await Promise.all([freeQueue?.close(), paidQueue?.close()]);
    await prisma?.user.deleteMany({
      where: { email: { startsWith: runId } },
    });
    await prisma?.$disconnect();
  });

  it('resolves concurrent duplicate intent to one generation and dispatches one signed queue job', async () => {
    const input = {
      resumeId,
      actorUserId,
      idempotencyKey: `${runId}-idempotency`,
      reason: ResumeRequeueReason.provider_recovered,
    };
    const request = async () => {
      try {
        const result = await prisma.$transaction((transaction) =>
          command.requestRequeueInTransaction(transaction, input),
        );
        return result.value;
      } catch (error) {
        if (
          error instanceof ResumeRequeueReplay ||
          error instanceof ResumeRequeuePersistenceConflict
        ) {
          return command.resolveIdempotentResult(input);
        }
        throw error;
      }
    };

    const [first, second] = await Promise.all([request(), request()]);
    expect(second).toEqual(first);
    await expect(
      prisma.resumeParseExecution.count({
        where: { resumeId, origin: ResumeParseExecutionOrigin.admin_requeue },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.resumeParseDispatch.count({
        where: { execution: { resumeId } },
      }),
    ).resolves.toBe(1);

    const signingKey = Buffer.alloc(32, 7).toString('base64');
    const config = {
      get: (key: string, fallback?: string) =>
        key === 'RESUME_QUEUE_SIGNING_KEY'
          ? signingKey
          : key === 'AI_EXECUTION_ROLE'
            ? 'all'
            : fallback,
    };
    const dispatcher = new ResumeParseDispatcher(
      prisma,
      config as never,
      freeQueue,
      paidQueue,
      new ResumeParseJobSignatureService(config as never),
    );
    const dispatchResults = await Promise.all([
      dispatcher.dispatchPending(1),
      dispatcher.dispatchPending(1),
    ]);
    expect(dispatchResults.reduce((total, count) => total + count, 0)).toBe(1);

    const persisted = await prisma.resumeParseExecution.findFirstOrThrow({
      where: { resumeId, generation: 1 },
      include: { dispatch: true },
    });
    expect(persisted).toEqual(
      expect.objectContaining({
        status: ResumeParseExecutionStatus.queued,
        attemptCount: 0,
        maxAttempts: 3,
        idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        dispatch: expect.objectContaining({ status: 'dispatched' }),
      }),
    );
    expect(JSON.stringify(persisted)).not.toContain(input.idempotencyKey);
    const job = await freeQueue.getJob(persisted.queueJobId);
    expect(job).not.toBeNull();
    expect(job?.opts.attempts).toBe(3);
    expect(job?.data).toEqual(
      expect.objectContaining({
        resumeId,
        executionBoundary: 'free',
        jobId: persisted.queueJobId,
        signature: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
});

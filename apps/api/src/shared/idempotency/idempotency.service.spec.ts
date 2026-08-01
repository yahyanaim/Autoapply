import { ConflictException } from '@nestjs/common';
import { IdempotencyStatus } from '@prisma/client';
import { IdempotencyService } from './idempotency.service';

interface StoredRecord {
  id: string;
  userId: string;
  key: string;
  operation: string;
  fingerprint: string;
  status: IdempotencyStatus;
  response: unknown;
  expiresAt: Date;
}

describe('IdempotencyService', () => {
  let records: Map<string, StoredRecord>;
  let idSequence: number;
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: IdempotencyService;

  beforeEach(() => {
    records = new Map();
    idSequence = 0;
    prisma = createPrismaMock(records, () => `claim-${++idSequence}`);
    service = new IdempotencyService(prisma as never);
  });

  it('admits only one of two concurrent claims', async () => {
    let releaseHandler!: (value: { jobs: string[] }) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const handler = jest.fn(
      () =>
        new Promise<{ jobs: string[] }>((resolve) => {
          releaseHandler = resolve;
          signalStarted();
        }),
    );

    const first = service.execute({
      userId: 'user-1',
      key: 'discover:concurrent-0001',
      operation: 'jobs.discover',
      payload: { resumeId: 'resume-1' },
      handler,
    });
    await started;

    await expect(
      service.execute({
        userId: 'user-1',
        key: 'discover:concurrent-0001',
        operation: 'jobs.discover',
        payload: { resumeId: 'resume-1' },
        handler,
      }),
    ).rejects.toThrow(ConflictException);

    releaseHandler({ jobs: ['job-1'] });
    await expect(first).resolves.toEqual({ jobs: ['job-1'] });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('replays the stored response without invoking the handler twice', async () => {
    const handler = jest.fn().mockResolvedValue({
      id: 'version-1',
      generatedAt: new Date('2026-07-29T10:00:00.000Z'),
    });

    const input = {
      userId: 'user-1',
      key: 'optimize:replay-000001',
      operation: 'ai.optimize',
      payload: { resumeId: 'resume-1', jobId: 'job-1' },
      handler,
    };
    const first = await service.execute<{
      id: string;
      generatedAt: Date;
    }>(input);
    const replayed = await service.execute<{
      id: string;
      generatedAt: Date | string;
    }>(input);

    expect(first.generatedAt).toBeInstanceOf(Date);
    expect(replayed).toEqual({
      id: 'version-1',
      generatedAt: '2026-07-29T10:00:00.000Z',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects the same key when its payload or operation changes', async () => {
    await service.execute({
      userId: 'user-1',
      key: 'cover:conflict-000001',
      operation: 'ai.cover-letter',
      payload: { jobId: 'job-1', tone: 'formal' },
      handler: async () => ({ id: 'letter-1' }),
    });

    await expect(
      service.execute({
        userId: 'user-1',
        key: 'cover:conflict-000001',
        operation: 'ai.cover-letter',
        payload: { jobId: 'job-2', tone: 'formal' },
        handler: async () => ({ id: 'letter-2' }),
      }),
    ).rejects.toThrow(
      'This Idempotency-Key was already used for a different request',
    );

    await expect(
      service.execute({
        userId: 'user-1',
        key: 'cover:conflict-000001',
        operation: 'applications.regenerate',
        payload: { jobId: 'job-1', tone: 'formal' },
        handler: async () => ({ id: 'application-1' }),
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('removes a failed claim so the same request can be retried', async () => {
    const handler = jest
      .fn<Promise<{ id: string }>, []>()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({ id: 'letter-1' });
    const input = {
      userId: 'user-1',
      key: 'cover:retry-failed-001',
      operation: 'ai.cover-letter',
      payload: { jobId: 'job-1', resumeId: 'resume-1' },
      handler,
    };

    await expect(service.execute(input)).rejects.toThrow(
      'provider unavailable',
    );
    await expect(service.execute(input)).resolves.toEqual({ id: 'letter-1' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('prunes expired records before claiming a key again', async () => {
    records.set('user-1:discover:expired-000001', {
      id: 'expired-claim',
      userId: 'user-1',
      key: 'discover:expired-000001',
      operation: 'jobs.discover',
      fingerprint: 'old',
      status: IdempotencyStatus.completed,
      response: { jobs: ['old'] },
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(
      service.execute({
        userId: 'user-1',
        key: 'discover:expired-000001',
        operation: 'jobs.discover',
        payload: { resumeId: 'resume-new' },
        handler: async () => ({ jobs: ['new'] }),
      }),
    ).resolves.toEqual({ jobs: ['new'] });
    expect(prisma.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: expect.any(Date) } },
    });
  });
});

function createPrismaMock(
  records: Map<string, StoredRecord>,
  nextId: () => string,
) {
  const byId = (id: string) =>
    [...records.entries()].find(([, record]) => record.id === id);

  return {
    idempotencyRecord: {
      create: jest.fn(
        async ({ data }: { data: Omit<StoredRecord, 'id' | 'response'> }) => {
          const mapKey = `${data.userId}:${data.key}`;
          if (records.has(mapKey)) throw { code: 'P2002' };
          const record: StoredRecord = {
            ...data,
            id: nextId(),
            response: null,
          };
          records.set(mapKey, record);
          return { id: record.id };
        },
      ),
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { userId_key: { userId: string; key: string } };
        }) => {
          const record = records.get(
            `${where.userId_key.userId}:${where.userId_key.key}`,
          );
          return record ? { ...record } : null;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status: IdempotencyStatus };
          data: Partial<StoredRecord>;
        }) => {
          const entry = byId(where.id);
          if (!entry || entry[1].status !== where.status) return { count: 0 };
          records.set(entry[0], { ...entry[1], ...data });
          return { count: 1 };
        },
      ),
      deleteMany: jest.fn(
        async ({
          where,
        }: {
          where:
            | { expiresAt: { lte: Date } }
            | {
                id: string;
                status?: IdempotencyStatus;
                expiresAt?: { lte: Date };
              };
        }) => {
          let count = 0;
          if ('id' in where) {
            const entry = byId(where.id);
            if (
              entry &&
              (!where.status || entry[1].status === where.status) &&
              (!where.expiresAt || entry[1].expiresAt <= where.expiresAt.lte)
            ) {
              records.delete(entry[0]);
              count = 1;
            }
          } else {
            for (const [key, record] of records) {
              if (record.expiresAt <= where.expiresAt.lte) {
                records.delete(key);
                count += 1;
              }
            }
          }
          return { count };
        },
      ),
    },
  };
}

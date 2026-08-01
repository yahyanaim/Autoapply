import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

const PENDING_TTL_MS = 15 * 60 * 1_000;
const COMPLETED_TTL_MS = 24 * 60 * 60 * 1_000;

export interface IdempotentExecution<T> {
  userId: string;
  key: string;
  operation: string;
  payload: unknown;
  handler: () => Promise<T>;
}

/**
 * Database-backed bounded replay admission for quota/cost-consuming HTTP
 * mutations. It deliberately stores the HTTP-ready JSON response so a client
 * that lost the first response can retry without repeating repository work
 * during the retention window.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>({
    userId,
    key,
    operation,
    payload,
    handler,
  }: IdempotentExecution<T>): Promise<T> {
    const fingerprint = fingerprintRequest(operation, payload);
    const now = new Date();

    // Opportunistic pruning keeps the table bounded without a process-local
    // scheduler, which would be unreliable in serverless deployments.
    await this.prisma.idempotencyRecord.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    const claim = await this.claim(userId, key, operation, fingerprint, now);
    if (claim.replayed) {
      return cloneJson<T>(claim.response);
    }

    let result: T;
    try {
      result = await handler();
    } catch (error) {
      // A handler failure is not a completed operation. Removing only our own
      // claim allows the same key to retry while never deleting a successor.
      await this.prisma.idempotencyRecord
        .deleteMany({
          where: {
            id: claim.id,
            status: IdempotencyStatus.pending,
          },
        })
        .catch(() => undefined);
      throw error;
    }

    // Do not release the claim if persisting the completed response fails
    // after the side effects succeeded. Keeping it pending is safer than
    // allowing an immediate duplicate provider call or quota charge.
    const response = toJsonValue(result);
    const completed = await this.prisma.idempotencyRecord.updateMany({
      where: {
        id: claim.id,
        status: IdempotencyStatus.pending,
      },
      data: {
        status: IdempotencyStatus.completed,
        response,
        expiresAt: new Date(Date.now() + COMPLETED_TTL_MS),
      },
    });

    if (completed.count !== 1) {
      throw new InternalServerErrorException(
        'The idempotency claim expired before the request completed',
      );
    }
    return result;
  }

  private async claim(
    userId: string,
    key: string,
    operation: string,
    fingerprint: string,
    now: Date,
  ): Promise<
    | { id: string; replayed: false }
    | { id: string; replayed: true; response: Prisma.JsonValue }
  > {
    try {
      const record = await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          key,
          operation,
          fingerprint,
          status: IdempotencyStatus.pending,
          expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
        },
        select: { id: true },
      });
      return { id: record.id, replayed: false };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
    }

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
      select: {
        id: true,
        fingerprint: true,
        status: true,
        response: true,
        expiresAt: true,
      },
    });

    // A record can disappear between the unique failure and this lookup only
    // when another request prunes it. Retry the atomic insert once.
    if (!existing) {
      return this.createClaimAfterRace(userId, key, operation, fingerprint);
    }

    if (existing.fingerprint !== fingerprint) {
      throw new ConflictException(
        'This Idempotency-Key was already used for a different request',
      );
    }

    if (existing.expiresAt <= now) {
      const removed = await this.prisma.idempotencyRecord.deleteMany({
        where: { id: existing.id, expiresAt: { lte: now } },
      });
      if (removed.count === 1) {
        return this.createClaimAfterRace(userId, key, operation, fingerprint);
      }
    }

    if (
      existing.status === IdempotencyStatus.completed &&
      existing.response !== null
    ) {
      return {
        id: existing.id,
        replayed: true,
        response: existing.response,
      };
    }

    throw new ConflictException(
      'A request with this Idempotency-Key is already in progress',
    );
  }

  private async createClaimAfterRace(
    userId: string,
    key: string,
    operation: string,
    fingerprint: string,
  ): Promise<{ id: string; replayed: false }> {
    try {
      const record = await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          key,
          operation,
          fingerprint,
          status: IdempotencyStatus.pending,
          expiresAt: new Date(Date.now() + PENDING_TTL_MS),
        },
        select: { id: true },
      });
      return { id: record.id, replayed: false };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'A request with this Idempotency-Key is already in progress',
        );
      }
      throw error;
    }
  }
}

function fingerprintRequest(operation: string, payload: unknown): string {
  return createHash('sha256')
    .update(stableJson({ operation, payload }))
    .digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  const object = value as Record<string, unknown>;
  const entries = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`);
  return `{${entries.join(',')}}`;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new InternalServerErrorException(
      'Idempotent handlers must return a JSON response',
    );
  }
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

function cloneJson<T>(value: Prisma.JsonValue): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

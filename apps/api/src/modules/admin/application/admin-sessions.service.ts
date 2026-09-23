import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { SessionClientType } from '@prisma/client';
import { AuthService } from '../../auth/application/auth.service';
import { MAX_ADMIN_USERS_PAGE_SIZE } from './admin-users.service';
import {
  AdminMutationContext,
  AdminMutationExecutor,
} from './admin-mutation.executor';

export interface ListAdminSessionsInput {
  currentSessionId?: string;
  cursor?: string;
  limit?: number;
  clientType?: SessionClientType;
  status?: 'active' | 'expired';
  createdFrom?: string;
  createdTo?: string;
  lastUsedFrom?: string;
  lastUsedTo?: string;
}

export interface RevokeAdminSessionInput {
  context: AdminMutationContext;
  targetUserId: string;
  targetSessionId: string;
  stepUpProof: string;
}

export interface RevokeAdminUserSessionsInput {
  context: AdminMutationContext;
  targetUserId: string;
  stepUpProof: string;
}

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class AdminSessionsService {
  constructor(
    private readonly auth: AuthService,
    private readonly mutations: AdminMutationExecutor,
  ) {}

  async list(input: ListAdminSessionsInput) {
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1),
      MAX_ADMIN_USERS_PAGE_SIZE,
    );
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const createdFrom = this.optionalDate(input.createdFrom);
    const createdTo = this.optionalDate(input.createdTo);
    const lastUsedFrom = this.optionalDate(input.lastUsedFrom);
    const lastUsedTo = this.optionalDate(input.lastUsedTo);
    this.assertRange(createdFrom, createdTo, 'created');
    this.assertRange(lastUsedFrom, lastUsedTo, 'last-used');

    const rows = await this.auth.listAdminSessions({
      limit,
      cursor,
      ...(input.clientType ? { clientType: input.clientType } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(createdFrom ? { createdFrom } : {}),
      ...(createdTo ? { createdTo } : {}),
      ...(lastUsedFrom ? { lastUsedFrom } : {}),
      ...(lastUsedTo ? { lastUsedTo } : {}),
    });
    const hasNextPage = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.length > 0 ? page[page.length - 1] : undefined;
    return {
      sessions: page.map((session) => ({
        userId: session.userId,
        sessionId: session.id,
        clientType: session.clientType,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current:
          Boolean(input.currentSessionId) &&
          session.id === input.currentSessionId,
      })),
      limit,
      nextCursor:
        hasNextPage && last
          ? this.encodeCursor(last.createdAt, last.id)
          : null,
    };
  }

  revoke(input: RevokeAdminSessionInput) {
    return this.mutations.execute({
      context: input.context,
      proof: input.stepUpProof,
      action: 'admin.session.revoke',
      targetType: 'session',
      targetId: input.targetSessionId,
      command: (transaction) => {
        // This check deliberately runs inside AdminMutationExecutor's
        // transaction, after proof consumption. Throwing here rolls the proof
        // update back and prevents both deletion and audit creation.
        if (
          input.targetUserId === input.context.actorUserId &&
          input.targetSessionId === input.context.sessionId
        ) {
          throw new ConflictException('admin.session.current_revoke_forbidden');
        }
        return this.auth.revokeAdminSessionInTransaction(
          transaction,
          input.targetUserId,
          input.targetSessionId,
        );
      },
    });
  }

  revokeAll(input: RevokeAdminUserSessionsInput) {
    return this.mutations.execute({
      context: input.context,
      proof: input.stepUpProof,
      action: 'admin.session.revoke_all',
      targetType: 'user',
      targetId: input.targetUserId,
      command: (transaction) =>
        this.auth.revokeAdminOtherSessionsInTransaction(
          transaction,
          input.targetUserId,
          input.targetUserId === input.context.actorUserId
            ? input.context.sessionId
            : undefined,
        ),
    });
  }

  private optionalDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid session date filter');
    }
    return date;
  }

  private assertRange(from: Date | undefined, to: Date | undefined, name: string) {
    if (from && to && from > to) {
      throw new BadRequestException(`Invalid ${name} date range`);
    }
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ createdAt: createdAt.toISOString(), id }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { createdAt?: unknown; id?: unknown };
      if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
        throw new Error('Invalid cursor shape');
      }
      const createdAt = new Date(parsed.createdAt);
      if (Number.isNaN(createdAt.getTime()) || parsed.id.length === 0) {
        throw new Error('Invalid cursor value');
      }
      return { createdAt, id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }
}

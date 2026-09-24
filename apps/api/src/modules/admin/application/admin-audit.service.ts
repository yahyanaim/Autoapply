import { BadRequestException, Injectable } from '@nestjs/common';
import { ActivityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

const SAFE_AUDIT_FIELDS = new Set([
  'status',
  'role',
  'plan',
  'enabled',
  'suspendedAt',
  'deactivatedAt',
  'reason',
]);
const SAFE_AUDIT_ENUM_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  status: new Set([
    'active',
    'suspended',
    'pending',
    'completed',
    'failed',
    'canceled',
    'enabled',
    'disabled',
    'deactivated',
  ]),
  role: new Set(['user', 'org_admin', 'platform_admin']),
  plan: new Set(['free', 'pro', 'premium']),
  reason: new Set([
    'provider_removed',
    'invalid_listing',
    'duplicate',
    'policy_violation',
    'security_risk',
    'other',
  ]),
};
const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9_-]{8,128}$/;
const ADMIN_ACTION_TYPES: Readonly<Record<string, ActivityType>> = {
  'admin.activity_log.read': ActivityType.admin_activity_log_read,
  'admin.user.suspend': ActivityType.admin_user_suspend,
  'admin.user.reactivate': ActivityType.admin_user_reactivate,
  'admin.session.revoke': ActivityType.admin_session_revoke,
  'admin.session.revoke_all': ActivityType.admin_session_revoke_all,
  'admin.job.deactivate': ActivityType.admin_job_deactivate,
};

export type AdminAuditSnapshot = Readonly<Record<string, unknown>>;

export interface AdminAuditRecord {
  actorUserId: string;
  targetType: string;
  targetId: string;
  action: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  before?: AdminAuditSnapshot;
  after?: AdminAuditSnapshot;
}

export interface AdminAuditTransaction {
  activityLog: Pick<Prisma.TransactionClient['activityLog'], 'create'>;
}

export interface ListAdminAuditLogsInput {
  cursor?: string;
  limit?: number;
  action?: string;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  createdFrom?: string;
  createdTo?: string;
}

interface AdminAuditCursor {
  createdAt: Date;
  id: string;
}

export interface AdminAuditSafeSnapshot {
  status?: string;
  role?: string;
  plan?: string;
  enabled?: boolean;
  suspendedAt?: string | null;
  deactivatedAt?: string | null;
  reason?: string;
}

export interface AdminAuditLogEntry {
  id: string;
  createdAt: string;
  action: string | null;
  targetType: string | null;
  targetId: string | null;
  actorRef: string | null;
  correlationId: string | null;
  before: AdminAuditSafeSnapshot | null;
  after: AdminAuditSafeSnapshot | null;
}

export interface AdminAuditReadContext {
  actorUserId: string;
  correlationId?: string;
}

const DEFAULT_ADMIN_AUDIT_PAGE_SIZE = 20;
export const MAX_ADMIN_AUDIT_PAGE_SIZE = 100;
export const ADMIN_ACTIVITY_LOG_READ_ACTION = 'admin.activity_log.read';
const ADMIN_ACTIVITY_LOG_TARGET_TYPE = 'activity_log';
const ADMIN_ACTIVITY_LOG_TARGET_ID = 'activity_log';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(
    transaction: AdminAuditTransaction,
    record: AdminAuditRecord,
  ): Promise<void> {
    const type = ADMIN_ACTION_TYPES[record.action];
    if (!type) {
      throw new BadRequestException('Unsupported administrative audit action');
    }
    await transaction.activityLog.create({
      data: {
        userId: record.targetType === 'user' ? record.targetId : undefined,
        type,
        actorUserId: record.actorUserId,
        targetType: record.targetType,
        targetId: record.targetId,
        action: record.action,
        correlationId: isSafeAdminCorrelationId(record.correlationId)
          ? record.correlationId
          : undefined,
        // Admin mutation logs deliberately omit raw request network metadata.
        // The request observability path owns denial-only 401/403 telemetry.
        ipAddress: undefined,
        userAgent: undefined,
        before: this.snapshot(record.before),
        after: this.snapshot(record.after),
      },
    });
  }

  async listForAdmin(
    input: ListAdminAuditLogsInput,
  ): Promise<{ events: AdminAuditLogEntry[]; limit: number; nextCursor: string | null }> {
    const limit = Math.min(
      Math.max(input.limit ?? DEFAULT_ADMIN_AUDIT_PAGE_SIZE, 1),
      MAX_ADMIN_AUDIT_PAGE_SIZE,
    );
    this.validateFilters(input);
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const createdFrom = this.optionalDate(input.createdFrom);
    const createdTo = this.optionalDate(input.createdTo);
    if (createdFrom && createdTo && createdFrom > createdTo) {
      throw new BadRequestException('Invalid activity-log date range');
    }

    const createdAt =
      createdFrom || createdTo
        ? {
            ...(createdFrom ? { gte: createdFrom } : {}),
            ...(createdTo ? { lte: createdTo } : {}),
          }
        : undefined;
    const rows = await this.prisma.activityLog.findMany({
      where: {
        ...(input.action ? { action: input.action } : {}),
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        ...(input.targetType ? { targetType: input.targetType } : {}),
        ...(input.targetId ? { targetId: input.targetId } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      select: {
        id: true,
        createdAt: true,
        actorUserId: true,
        targetType: true,
        targetId: true,
        action: true,
        correlationId: true,
        before: true,
        after: true,
      },
    });
    const hasNextPage = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.length > 0 ? page[page.length - 1] : undefined;

    return {
      events: page.map((row) => this.toSafeEntry(row)),
      limit,
      nextCursor:
        hasNextPage && last
          ? this.encodeCursor(last.createdAt, last.id)
          : null,
    };
  }

  /**
   * Reads an allow-listed audit projection and then records one event. The
   * read query occurs before the write, so its page can never contain its own
   * trace event. The write path does not invoke this method, preventing
   * recursion.
   */
  async readForAdmin(
    input: ListAdminAuditLogsInput,
    context: AdminAuditReadContext,
  ): Promise<{ events: AdminAuditLogEntry[]; limit: number; nextCursor: string | null }> {
    if (!isSafeAdminIdentifier(context.actorUserId)) {
      throw new BadRequestException('Invalid administrative audit actor');
    }
    const page = await this.listForAdmin(input);
    await this.write(this.prisma, {
      actorUserId: context.actorUserId,
      targetType: ADMIN_ACTIVITY_LOG_TARGET_TYPE,
      targetId: ADMIN_ACTIVITY_LOG_TARGET_ID,
      action: ADMIN_ACTIVITY_LOG_READ_ACTION,
      correlationId: context.correlationId,
    });
    return page;
  }

  private snapshot(
    value: AdminAuditSnapshot | undefined,
  ): Prisma.InputJsonValue | undefined {
    const safe = this.redactedSnapshot(value);
    return safe ? (safe as Prisma.InputJsonObject) : undefined;
  }

  private redactedSnapshot(
    value: AdminAuditSnapshot | undefined,
  ): AdminAuditSafeSnapshot | undefined {
    if (!value) return undefined;
    const safe: Record<string, string | number | boolean | null> = {};
    for (const key of SAFE_AUDIT_FIELDS) {
      const candidate = value[key];
      if (key.endsWith('At')) {
        const timestamp = this.utcTimestamp(candidate);
        if (timestamp !== undefined) safe[key] = timestamp;
      } else if (key === 'enabled' && typeof candidate === 'boolean') {
        safe[key] = candidate;
      } else if (
        typeof candidate === 'string' &&
        SAFE_AUDIT_ENUM_VALUES[key]?.has(candidate)
      ) {
        safe[key] = candidate;
      }
    }
    return Object.keys(safe).length > 0
      ? (safe as AdminAuditSafeSnapshot)
      : undefined;
  }

  private toSafeEntry(row: {
    id: string;
    createdAt: Date;
    actorUserId: string | null;
    targetType: string | null;
    targetId: string | null;
    action: string | null;
    correlationId: string | null;
    before: Prisma.JsonValue | null;
    after: Prisma.JsonValue | null;
  }): AdminAuditLogEntry {
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: this.safeIdentifier(row.action),
      targetType: this.safeIdentifier(row.targetType),
      targetId: this.safeIdentifier(row.targetId),
      actorRef: this.safeIdentifier(row.actorUserId),
      correlationId: isSafeAdminCorrelationId(row.correlationId)
        ? row.correlationId
        : null,
      before: this.readSnapshot(row.before),
      after: this.readSnapshot(row.after),
    };
  }

  private readSnapshot(
    value: Prisma.JsonValue | null,
  ): AdminAuditSafeSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return this.redactedSnapshot(value as AdminAuditSnapshot) ?? null;
  }

  private validateFilters(input: ListAdminAuditLogsInput): void {
    for (const value of [
      input.action,
      input.actorUserId,
      input.targetType,
      input.targetId,
    ]) {
      if (value !== undefined && !isSafeAdminIdentifier(value)) {
        throw new BadRequestException('Invalid activity-log filter');
      }
    }
  }

  private optionalDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid activity-log date filter');
    }
    return date;
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ createdAt: createdAt.toISOString(), id }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(cursor: string): AdminAuditCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { createdAt?: unknown; id?: unknown };
      if (typeof parsed.createdAt !== 'string' || !isSafeAdminIdentifier(parsed.id)) {
        throw new Error('Invalid cursor shape');
      }
      const createdAt = new Date(parsed.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error('Invalid cursor date');
      }
      return { createdAt, id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid activity-log pagination cursor');
    }
  }

  private safeIdentifier(value: string | null): string | null {
    return isSafeAdminIdentifier(value) ? value : null;
  }

  private utcTimestamp(value: unknown): string | null | undefined {
    if (value === null) return null;
    const date = value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toISOString()
      : undefined;
  }

}

export function isSafeAdminIdentifier(value: unknown): value is string {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value);
}

export function isSafeAdminCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_CORRELATION_ID.test(value);
}

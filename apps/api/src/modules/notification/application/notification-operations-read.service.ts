import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1_000;

@Injectable()
export class NotificationOperationsReadService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async getDeliverySummary(input: {
    cursor?: string;
    limit?: number;
    createdFrom?: string;
    createdTo?: string;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const to = input.createdTo ? this.parseDate(input.createdTo) : this.clock.now();
    const from = input.createdFrom
      ? this.parseDate(input.createdFrom)
      : new Date(to.getTime() - 24 * 60 * 60 * 1_000);
    if (from > to || to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('Invalid notification date range');
    }
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const where: Prisma.NotificationWhereInput = { createdAt: { gte: from, lte: to } };
    const [groups, failures] = await Promise.all([
      this.prisma.notification.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.notification.findMany({
        where: { ...where, status: NotificationStatus.failed },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
        select: {
          id: true,
          channel: true,
          status: true,
          createdAt: true,
          sentAt: true,
        },
      }),
    ]);
    const counts = Object.fromEntries(
      Object.values(NotificationStatus).map((status) => [status, 0]),
    ) as Record<NotificationStatus, number>;
    for (const group of groups) counts[group.status] = group._count._all;
    const page = failures.slice(0, limit);
    const last = page.length > 0 ? page[page.length - 1] : undefined;
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      rollup: {
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        pending: counts.pending,
        sent: counts.sent,
        failed: counts.failed,
        read: counts.read,
      },
      failures: page.map((failure) => ({
        id: failure.id,
        channel: failure.channel,
        status: failure.status,
        createdAt: failure.createdAt.toISOString(),
        sentAt: failure.sentAt?.toISOString() ?? null,
      })),
      limit,
      nextCursor:
        failures.length > limit && last
          ? this.encodeCursor(last.createdAt, last.id)
          : null,
    };
  }

  private parseDate(value: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('Invalid notification date range');
    return date;
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url');
  }

  private decodeCursor(value: string): { createdAt: Date; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown };
      const createdAt = new Date(String(parsed.createdAt));
      if (typeof parsed.id !== 'string' || !parsed.id || !Number.isFinite(createdAt.getTime())) throw new Error('invalid');
      return { createdAt, id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid notifications cursor');
    }
  }
}

import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;

@Injectable()
export class ApplicationOperationsReadService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async getAggregate(input: { createdFrom?: string; createdTo?: string }) {
    const to = input.createdTo ? this.parseDate(input.createdTo) : this.clock.now();
    const from = input.createdFrom
      ? this.parseDate(input.createdFrom)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000);
    if (from > to || to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('Invalid application date range');
    }
    const groups = await this.prisma.application.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(
      Object.values(ApplicationStatus).map((status) => [status, 0]),
    ) as Record<ApplicationStatus, number>;
    for (const group of groups) byStatus[group.status] = group._count._all;
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      byStatus,
    };
  }

  private parseDate(value: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('Invalid application date range');
    return date;
  }
}

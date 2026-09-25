import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1_000;
const BATCH_SIZE = 500;
export const MAX_AI_METRICS_RANGE_DAYS = 90;

export interface AiMetricsDay {
  day: string;
  requestCount: number;
  costedRequestCount: number;
  estimatedCostUsd: number;
}

export interface AiMetricsSummary {
  costType: 'estimated';
  currency: 'usd';
  requestCount: number;
  costedRequestCount: number;
  estimatedCostUsd: number;
  daily: AiMetricsDay[];
}

@Injectable()
export class AiMetricsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getEstimatedCostMetrics(input: {
    from: Date;
    toExclusive: Date;
  }): Promise<AiMetricsSummary> {
    this.assertRange(input.from, input.toExclusive);
    const daily = this.emptyDays(input.from, input.toExclusive);
    const byDay = new Map(daily.map((entry) => [entry.day, entry]));
    let cursor: string | undefined;
    let requestCount = 0;
    let costedRequestCount = 0;
    let estimatedCostUsd = 0;

    do {
      const rows = await this.prisma.aIRequest.findMany({
        where: {
          createdAt: { gte: input.from, lt: input.toExclusive },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, createdAt: true, cost: true },
      });

      for (const row of rows) {
        const day = row.createdAt.toISOString().slice(0, 10);
        const bucket = byDay.get(day);
        if (!bucket) continue;
        requestCount += 1;
        bucket.requestCount += 1;
        if (row.cost !== null) {
          costedRequestCount += 1;
          bucket.costedRequestCount += 1;
          estimatedCostUsd += row.cost;
          bucket.estimatedCostUsd += row.cost;
        }
      }

      cursor =
        rows.length === BATCH_SIZE ? rows[rows.length - 1]?.id : undefined;
    } while (cursor);

    for (const bucket of daily) {
      bucket.estimatedCostUsd = this.roundCost(bucket.estimatedCostUsd);
    }
    return {
      costType: 'estimated',
      currency: 'usd',
      requestCount,
      costedRequestCount,
      estimatedCostUsd: this.roundCost(estimatedCostUsd),
      daily,
    };
  }

  private assertRange(from: Date, toExclusive: Date): void {
    const rangeMs = toExclusive.getTime() - from.getTime();
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(toExclusive.getTime()) ||
      from.getUTCHours() !== 0 ||
      from.getUTCMinutes() !== 0 ||
      from.getUTCSeconds() !== 0 ||
      from.getUTCMilliseconds() !== 0 ||
      toExclusive.getUTCHours() !== 0 ||
      toExclusive.getUTCMinutes() !== 0 ||
      toExclusive.getUTCSeconds() !== 0 ||
      toExclusive.getUTCMilliseconds() !== 0 ||
      rangeMs <= 0 ||
      rangeMs > MAX_AI_METRICS_RANGE_DAYS * DAY_MS
    ) {
      throw new BadRequestException('Invalid AI metrics UTC date range');
    }
  }

  private emptyDays(from: Date, toExclusive: Date): AiMetricsDay[] {
    const days: AiMetricsDay[] = [];
    for (
      let timestamp = from.getTime();
      timestamp < toExclusive.getTime();
      timestamp += DAY_MS
    ) {
      days.push({
        day: new Date(timestamp).toISOString().slice(0, 10),
        requestCount: 0,
        costedRequestCount: 0,
        estimatedCostUsd: 0,
      });
    }
    return days;
  }

  private roundCost(value: number): number {
    return Number(value.toFixed(6));
  }
}

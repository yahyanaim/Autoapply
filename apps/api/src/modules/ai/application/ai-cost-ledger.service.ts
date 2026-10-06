import { ConflictException, Injectable, Optional } from '@nestjs/common';
import { AiCostEventKind, AiCostIntentState, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

export const AI_COST_BOUNDARY_ID = 'estimated_ai_cost_v1';
const DAY_MS = 86_400_000;
const MAX_DAYS = 90;

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** A durable, anonymous estimate. One micro-USD is 0.000001 USD. */
@Injectable()
export class AiCostLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async beginAttempt(): Promise<string> {
    const now = new Date();
    const boundary = await this.prisma.aiCostMetricsBoundary.findUniqueOrThrow({
      where: { id: AI_COST_BOUNDARY_ID }, select: { metricsStartAt: true },
    });
    if (now < boundary.metricsStartAt) throw new Error('AI cost capture is not active');
    await this.prisma.aiCostMetricsBoundary.updateMany({
      where: { id: AI_COST_BOUNDARY_ID, captureActivatedAt: null },
      data: { captureActivatedAt: now },
    });
    const id = randomUUID();
    await this.prisma.aiCostIntent.create({ data: { id, startedAt: now } });
    return id;
  }

  /** USD/million-token rates become micro-USD/token; round HALF_UP once per attempt. */
  estimateMicroUsd(inputTokens: number, outputTokens: number, inputRate: number, outputRate: number): bigint {
    if (![inputTokens, outputTokens].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      ![inputRate, outputRate].every((value) => Number.isFinite(value) && value >= 0)) {
      throw new Error('Invalid AI cost estimate');
    }
    const estimate = new Prisma.Decimal(inputTokens).mul(new Prisma.Decimal(inputRate.toString()))
      .add(new Prisma.Decimal(outputTokens).mul(new Prisma.Decimal(outputRate.toString())))
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    return BigInt(estimate.toFixed(0));
  }

  async finalizeInTransaction(
    tx: Prisma.TransactionClient,
    input: { intentId: string; effectiveAt: Date; estimatedMicroUsd: bigint | null },
  ): Promise<void> {
    if (!Number.isFinite(input.effectiveAt.getTime()) ||
      (input.estimatedMicroUsd !== null && input.estimatedMicroUsd < 0n)) {
      throw new Error('Invalid AI cost outcome');
    }
    const updated = await tx.aiCostIntent.updateMany({
      where: { id: input.intentId, state: AiCostIntentState.pending },
      data: {
        state: input.estimatedMicroUsd === null ? AiCostIntentState.uncosted : AiCostIntentState.costed,
        effectiveAt: input.effectiveAt,
      },
    });
    if (updated.count === 0) {
      const original = await tx.aiCostIntent.findUniqueOrThrow({
        where: { id: input.intentId }, select: { state: true, effectiveAt: true },
      });
      if (original.effectiveAt?.getTime() !== input.effectiveAt.getTime() ||
        (input.estimatedMicroUsd === null) !== (original.state === AiCostIntentState.uncosted)) {
        throw new ConflictException('AI cost attempt already finalized');
      }
      if (input.estimatedMicroUsd !== null) {
        const event = await tx.aiCostEvent.findUniqueOrThrow({
          where: { intentId_kind: { intentId: input.intentId, kind: AiCostEventKind.estimate } },
          select: { estimatedMicroUsd: true },
        });
        if (event.estimatedMicroUsd !== input.estimatedMicroUsd) {
          throw new ConflictException('AI cost attempt already finalized');
        }
      }
      return;
    }
    if (input.estimatedMicroUsd !== null) {
      await tx.aiCostEvent.create({ data: {
        intentId: input.intentId, kind: AiCostEventKind.estimate,
        estimatedMicroUsd: input.estimatedMicroUsd, effectiveAt: input.effectiveAt,
      } });
    }
    await tx.aiDailyCostMetric.upsert({
      where: { day: utcDay(input.effectiveAt) },
      create: {
        day: utcDay(input.effectiveAt),
        estimatedMicroUsd: input.estimatedMicroUsd ?? 0n,
        costedRequestCount: input.estimatedMicroUsd === null ? 0 : 1,
        uncostedRequestCount: input.estimatedMicroUsd === null ? 1 : 0,
      },
      update: {
        estimatedMicroUsd: { increment: input.estimatedMicroUsd ?? 0n },
        ...(input.estimatedMicroUsd === null
          ? { uncostedRequestCount: { increment: 1 } }
          : { costedRequestCount: { increment: 1 } }),
      },
    });
  }

  async finalizeAttempt(input: { intentId: string; effectiveAt: Date; estimatedMicroUsd: bigint | null }): Promise<void> {
    await this.prisma.$transaction((tx) => this.finalizeInTransaction(tx, input));
  }

  async resolveUncosted(intentId: string, estimatedMicroUsd: bigint): Promise<void> {
    if (estimatedMicroUsd < 0n) throw new Error('Invalid AI cost estimate');
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.aiCostIntent.updateMany({
        where: { id: intentId, state: AiCostIntentState.uncosted },
        data: { state: AiCostIntentState.costed },
      });
      if (updated.count !== 1) {
        const existing = await tx.aiCostEvent.findUnique({
          where: { intentId_kind: { intentId, kind: AiCostEventKind.resolution } },
          select: { estimatedMicroUsd: true },
        });
        if (existing?.estimatedMicroUsd === estimatedMicroUsd) return;
        throw new ConflictException('AI cost attempt cannot be resolved');
      }
      const intent = await tx.aiCostIntent.findUniqueOrThrow({
        where: { id: intentId }, select: { effectiveAt: true },
      });
      if (!intent.effectiveAt) throw new Error('AI cost effective time is missing');
      await tx.aiCostEvent.create({ data: {
        intentId, kind: AiCostEventKind.resolution, estimatedMicroUsd,
        effectiveAt: intent.effectiveAt,
      } });
      await tx.aiDailyCostMetric.update({
        where: { day: utcDay(intent.effectiveAt) },
        data: {
          estimatedMicroUsd: { increment: estimatedMicroUsd },
          costedRequestCount: { increment: 1 },
          uncostedRequestCount: { decrement: 1 },
        },
      });
    });
  }

  async getCoverage(input: { from: Date; toExclusive: Date }) {
    const rangeMs = input.toExclusive.getTime() - input.from.getTime();
    if (!Number.isFinite(rangeMs) || rangeMs <= 0 || rangeMs > MAX_DAYS * DAY_MS ||
      input.from.getTime() % DAY_MS !== 0 || input.toExclusive.getTime() % DAY_MS !== 0) {
      throw new Error('Invalid AI cost UTC range');
    }
    const asOf = this.clock.now();
    const boundary = await this.prisma.aiCostMetricsBoundary.findUniqueOrThrow({
      where: { id: AI_COST_BOUNDARY_ID },
      select: { metricsStartAt: true, captureActivatedAt: true },
    });
    const activeFrom = boundary.captureActivatedAt && boundary.captureActivatedAt > boundary.metricsStartAt
      ? boundary.captureActivatedAt : boundary.metricsStartAt;
    const from = input.from > activeFrom ? input.from : activeFrom;
    const toExclusive = input.toExclusive < asOf ? input.toExclusive : asOf;
    const actualCoveredRange = boundary.captureActivatedAt && from < toExclusive
      ? { from, toExclusive } : null;
    const unresolved = actualCoveredRange ? await this.prisma.aiCostIntent.count({
      where: { startedAt: { lt: toExclusive }, OR: [
        { state: AiCostIntentState.pending },
        { state: AiCostIntentState.uncosted, effectiveAt: { gte: from, lt: toExclusive } },
      ] },
    }) : 0;
    return {
      boundary: boundary.metricsStartAt,
      activationAt: boundary.captureActivatedAt,
      asOf,
      requestedRange: input,
      actualCoveredRange,
      status: !actualCoveredRange ? 'unavailable' as const
        : unresolved > 0 ? 'unresolved' as const
          : input.from < from || input.toExclusive > asOf ? 'partial' as const : 'full' as const,
      unresolvedRequestCount: unresolved,
      costType: 'estimated' as const,
    };
  }
}

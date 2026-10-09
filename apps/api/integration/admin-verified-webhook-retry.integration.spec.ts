import { createHash } from 'node:crypto';
import { ModuleRef } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import Stripe from 'stripe';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { AdminAuditService } from '../src/modules/admin/application/admin-audit.service';
import { AdminMutationExecutor } from '../src/modules/admin/application/admin-mutation.executor';
import { AdminStepUpMfaService } from '../src/modules/admin/application/admin-step-up-mfa.service';
import { AdminVerifiedWebhooksService } from '../src/modules/admin/application/admin-verified-webhooks.service';
import { AdminWebhookRetryService } from '../src/modules/admin/application/admin-webhook-retry.service';
import { BillingEvidenceRetryService } from '../src/modules/billing/application/billing-evidence-retry.service';
import { BillingFinancialCompletenessService } from '../src/modules/billing/application/billing-financial-completeness.service';
import { BillingService } from '../src/modules/billing/application/billing.service';
import { BillingStripeFeeService } from '../src/modules/billing/application/billing-stripe-fee.service';
import { BillingVerifiedWebhookRetryService } from '../src/modules/billing/application/billing-verified-webhook-retry.service';
import { BillingVerifiedWebhookService } from '../src/modules/billing/application/billing-verified-webhook.service';
import { BillingController } from '../src/modules/billing/interface/billing.controller';

const run = `adminretry${process.pid}${Date.now()}`;
const request = { headers: { 'stripe-signature': 'synthetic-signature' },
  rawBody: Buffer.from('{}') } as unknown as RawBodyRequest<Request>;

describe('Billing-owned Admin verified webhook retry PostgreSQL integration', () => {
  let prisma: PrismaService;
  let controller: BillingController;
  let worker: BillingEvidenceRetryService;
  let admin: AdminWebhookRetryService;
  let billingRetry: BillingVerifiedWebhookRetryService;
  let verified: BillingVerifiedWebhookService;
  let actorUserId: string;
  let feeDay: Date;
  const eventIds: string[] = [];
  const stripe = {
    constructWebhookEvent: jest.fn(), retrieveEvent: jest.fn(),
    retrieveBalanceTransaction: jest.fn(),
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) throw new Error('Isolated test DATABASE_URL required');
    prisma = new PrismaService();
    await prisma.$connect();
    const boundary = await prisma.billingStripeFeeMetricsBoundary.findUniqueOrThrow({
      where: { id: 'stripe_fees_v1' }, select: { metricsStartAt: true },
    });
    feeDay = new Date(Date.UTC(boundary.metricsStartAt.getUTCFullYear() + 3,
      boundary.metricsStartAt.getUTCMonth(), boundary.metricsStartAt.getUTCDate()));
    const actor = await prisma.user.create({ data: {
      email: `${run}@example.test`, role: UserRole.platform_admin,
    } });
    actorUserId = actor.id;
    billingRetry = new BillingVerifiedWebhookRetryService(prisma);
    verified = new BillingVerifiedWebhookService(prisma, billingRetry);
    const completeness = new BillingFinancialCompletenessService(prisma);
    const fees = new BillingStripeFeeService(stripe as never);
    const billing = new BillingService(prisma, stripe as never, {} as never,
      {} as never, fees, undefined, completeness, verified);
    controller = new BillingController(billing, stripe as never, verified);
    worker = new BillingEvidenceRetryService(prisma, stripe as never, completeness,
      fees, { get: () => billing } as unknown as ModuleRef);
    admin = new AdminWebhookRetryService(new AdminMutationExecutor(prisma,
      new AdminStepUpMfaService(prisma, {} as never), new AdminAuditService(prisma)), billingRetry);
  });

  afterAll(async () => {
    if (!prisma) return;
    const cases = await prisma.billingFinancialEvidenceCase.findMany({
      where: { sourceStripeEventId: { in: eventIds } }, select: { id: true },
    });
    await prisma.activityLog.deleteMany({ where: { action: 'admin.webhook.retry', actorUserId } });
    await prisma.adminStepUpMfaProof.deleteMany({ where: { actorUserId } });
    await prisma.billingEvidenceResolution.deleteMany({ where: { caseId: { in: cases.map((row) => row.id) } } });
    await prisma.billingFinancialEvidenceCase.deleteMany({ where: { id: { in: cases.map((row) => row.id) } } });
    await prisma.billingStripeFeeEffect.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.billingStripeFeeObservation.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.billingVerifiedWebhookDelivery.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.stripeWebhookEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.billingDailyStripeFeeMetric.deleteMany({ where: { day: feeDay } });
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await prisma.$disconnect();
  });

  function event(label: string) {
    const id = `evt_${run}${label}`;
    eventIds.push(id);
    return { id, type: 'charge.succeeded', created: Math.floor(Date.now() / 1000),
      data: { object: { id: `ch_${run}${label}`, balance_transaction: `txn_${run}${label}` } },
    } as unknown as Stripe.Event;
  }

  function proof(label: string) {
    return createHash('sha256').update(`${run}:${label}`).digest('base64url');
  }

  async function bindProof(deliveryId: string, label: string) {
    const value = proof(label);
    await prisma.adminStepUpMfaProof.create({ data: {
      actorUserId, sessionId: 'session-webhook-retry', action: 'admin.webhook.retry',
      targetType: 'webhook_delivery', targetId: deliveryId,
      proofHash: createHash('sha256').update(value).digest('hex'),
      expiresAt: new Date(Date.now() + 300_000),
    } });
    return value;
  }

  function retryRequest(deliveryId: string, stepUpProof: string, idempotencyKey: string) {
    return admin.request({
      context: { actorUserId, sessionId: 'session-webhook-retry',
        role: UserRole.platform_admin, mfaVerified: true,
        correlationId: 'request_webhookretry123' },
      deliveryId, idempotencyKey, stepUpProof,
    });
  }

  async function overlappingAdminRequests(deliveryId: string, firstProof: string,
    secondProof: string, firstKey: string, secondKey: string) {
    const original = billingRetry.requestInTransaction.bind(billingRetry);
    let releaseFirst!: () => void;
    let firstScheduled!: () => void;
    let secondEntered!: () => void;
    const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstAtBoundary = new Promise<void>((resolve) => { firstScheduled = resolve; });
    const secondAtBoundary = new Promise<void>((resolve) => { secondEntered = resolve; });
    let calls = 0;
    const scheduling = jest.spyOn(billingRetry, 'requestInTransaction').mockImplementation(async (tx, input) => {
      calls++;
      if (calls === 1) {
        const result = await original(tx, input);
        firstScheduled();
        await holdFirst;
        return result;
      }
      if (calls === 2) secondEntered();
      return original(tx, input);
    });
    try {
      const first = retryRequest(deliveryId, firstProof, firstKey);
      await firstAtBoundary;
      const second = retryRequest(deliveryId, secondProof, secondKey);
      await secondAtBoundary;
      // The first transaction has changed the case, but neither its intent nor audit is committed.
      const delivery = await prisma.billingVerifiedWebhookDelivery.findUniqueOrThrow({
        where: { id: deliveryId }, select: { eventId: true },
      });
      const committedCase = await prisma.billingFinancialEvidenceCase.findUniqueOrThrow({
        where: { sourceStripeEventId_component: {
          sourceStripeEventId: delivery.eventId, component: 'stripe_fee',
        } },
      });
      expect(committedCase.adminRetryKeyHash).toBeNull();
      expect(await prisma.activityLog.count({ where: {
        action: 'admin.webhook.retry', targetId: deliveryId,
      } })).toBe(0);
      releaseFirst();
      return await Promise.allSettled([first, second]);
    } finally {
      releaseFirst();
      scheduling.mockRestore();
    }
  }

  async function failedDelivery(item: Stripe.Event) {
    stripe.constructWebhookEvent.mockReturnValue(item);
    stripe.retrieveBalanceTransaction.mockRejectedValueOnce(new Stripe.errors.StripeConnectionError({
      type: 'api_error', message: 'private provider detail',
    }));
    await expect(controller.handleWebhook(request)).rejects.toBeInstanceOf(Stripe.errors.StripeConnectionError);
    const delivery = await prisma.billingVerifiedWebhookDelivery.findFirstOrThrow({
      where: { eventId: item.id }, orderBy: { observedAt: 'desc' },
    });
    expect(delivery).toMatchObject({ state: 'retryable_failure', reason: 'provider_unavailable' });
    expect(delivery.eventCreatedAt).toEqual(new Date(item.created * 1000));
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(0);
    return delivery;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    stripe.retrieveBalanceTransaction.mockImplementation(async (transactionId: string) => ({
      id: transactionId, fee: -25, currency: 'usd', created: Math.floor(feeDay.getTime() / 1000),
    }));
  });

  it('rolls back proof and intent on audit failure, then deduplicates concurrent Admin requests and signed effects', async () => {
    const item = event('audit');
    const delivery = await failedDelivery(item);
    const evidence = await prisma.billingFinancialEvidenceCase.findFirstOrThrow({
      where: { sourceStripeEventId: item.id },
    });
    await prisma.billingFinancialEvidenceCase.update({ where: { id: evidence.id },
      data: { nextAttemptAt: new Date(Date.now() + 3_600_000) } });
    const firstProof = await bindProof(delivery.id, 'audit-first');
    const key = `${run}-same`;
    const failing = new AdminWebhookRetryService(new AdminMutationExecutor(prisma,
      new AdminStepUpMfaService(prisma, {} as never),
      { write: async () => { throw new Error('synthetic audit failure'); } } as never),
    new BillingVerifiedWebhookRetryService(prisma));
    await expect(failing.request({ context: { actorUserId, sessionId: 'session-webhook-retry',
      role: UserRole.platform_admin, mfaVerified: true, correlationId: 'request_webhookretry123' },
    deliveryId: delivery.id, idempotencyKey: key, stepUpProof: firstProof })).rejects.toThrow('synthetic audit failure');
    expect(await prisma.billingFinancialEvidenceCase.findUniqueOrThrow({ where: { id: evidence.id } }))
      .toMatchObject({ adminRetryKeyHash: null, adminRetryDeliveryId: null });
    expect((await prisma.adminStepUpMfaProof.findFirstOrThrow({ where: {
      proofHash: createHash('sha256').update(firstProof).digest('hex'),
    } })).usedAt).toBeNull();
    const secondProof = await bindProof(delivery.id, 'audit-second');
    const [first, second] = await overlappingAdminRequests(delivery.id,
      firstProof, secondProof, key, key);
    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('fulfilled');
    if (first.status !== 'fulfilled' || second.status !== 'fulfilled') return;
    expect(second.value).toEqual(first.value);
    expect(first.value).toMatchObject({ deliveryId: delivery.id, status: 'retry_requested' });
    const attempts = await prisma.adminStepUpMfaProof.findMany({ where: { targetId: delivery.id } });
    expect(attempts.filter((row) => row.usedAt !== null)).toHaveLength(1);
    expect(await prisma.billingFinancialEvidenceCase.count({ where: {
      sourceStripeEventId: item.id, adminRetryDeliveryId: delivery.id,
    } })).toBe(1);
    expect(attempts.find((row) => row.proofHash === createHash('sha256').update(secondProof).digest('hex'))?.usedAt)
      .toBeNull();
    const audits = await prisma.activityLog.findMany({ where: { action: 'admin.webhook.retry', targetId: delivery.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ type: 'admin_webhook_retry', actorUserId, targetType: 'webhook_delivery',
      ipAddress: null, userAgent: null });
    const thirdProof = await bindProof(delivery.id, 'audit-third');
    await expect(retryRequest(delivery.id, thirdProof, `${run}-different`)).rejects.toThrow();
    expect((await prisma.adminStepUpMfaProof.findFirstOrThrow({ where: {
      proofHash: createHash('sha256').update(thirdProof).digest('hex'),
    } })).usedAt).toBeNull();
    expect(JSON.stringify(audits)).not.toMatch(new RegExp(`${item.id}|${key}|${firstProof}|private provider detail`));

    stripe.retrieveEvent.mockResolvedValue(item);
    await worker.processDueOnce();
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(1);
    expect(await prisma.billingStripeFeeEffect.count({ where: { sourceStripeEventId: item.id } })).toBe(1);
    expect(await prisma.billingStripeFeeEffect.findFirstOrThrow({ where: { sourceStripeEventId: item.id } }))
      .toMatchObject({ feeMinor: -25n });
    expect(await prisma.billingDailyStripeFeeMetric.findUniqueOrThrow({
      where: { day_currency: { day: feeDay, currency: 'usd' } },
    })).toMatchObject({ feeMinor: -25n, feeEffectCount: 1 });
    await worker.processDueOnce();
    expect(await prisma.billingStripeFeeEffect.count({ where: { sourceStripeEventId: item.id } })).toBe(1);
    const adminRead = await new AdminVerifiedWebhooksService(verified).list({
      from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10),
    });
    expect(adminRead.items.find((row) => row.id === delivery.id)).toMatchObject({
      status: 'resolved', retryEligible: false, retryStatus: 'processed',
    });
    expect(JSON.stringify(adminRead)).not.toMatch(new RegExp(`${item.id}|private provider detail|txn_${run}`));
  });

  it('conflicts a different-key Admin request overlapping the same scheduling transaction without consuming its proof', async () => {
    const item = event('differentkeys');
    const delivery = await failedDelivery(item);
    const evidence = await prisma.billingFinancialEvidenceCase.findFirstOrThrow({
      where: { sourceStripeEventId: item.id },
    });
    await prisma.billingFinancialEvidenceCase.update({ where: { id: evidence.id },
      data: { nextAttemptAt: new Date(Date.now() + 3_600_000) } });
    const winnerProof = await bindProof(delivery.id, 'different-winner');
    const loserProof = await bindProof(delivery.id, 'different-loser');
    const [winner, loser] = await overlappingAdminRequests(delivery.id,
      winnerProof, loserProof, `${run}-winner`, `${run}-loser`);
    expect(winner.status).toBe('fulfilled');
    expect(loser.status).toBe('rejected');
    if (winner.status !== 'fulfilled' || loser.status !== 'rejected') return;
    expect(winner.value).toMatchObject({ deliveryId: delivery.id, status: 'retry_requested' });
    expect(loser.reason).toMatchObject({ status: 409 });
    expect(await prisma.billingFinancialEvidenceCase.count({ where: {
      sourceStripeEventId: item.id, adminRetryDeliveryId: delivery.id,
    } })).toBe(1);
    expect(await prisma.activityLog.count({ where: {
      action: 'admin.webhook.retry', targetId: delivery.id,
    } })).toBe(1);
    expect((await prisma.adminStepUpMfaProof.findFirstOrThrow({ where: {
      proofHash: createHash('sha256').update(winnerProof).digest('hex'),
    } })).usedAt).not.toBeNull();
    expect((await prisma.adminStepUpMfaProof.findFirstOrThrow({ where: {
      proofHash: createHash('sha256').update(loserProof).digest('hex'),
    } })).usedAt).toBeNull();
  });

  it('keeps one monetary effect when a signed webhook wins against an already claimed Admin retry', async () => {
    const item = event('race');
    const delivery = await failedDelivery(item);
    const stepUpProof = await bindProof(delivery.id, 'race');
    await retryRequest(delivery.id, stepUpProof, `${run}-race`);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const enteredProvider = new Promise<void>((resolve) => { entered = resolve; });
    stripe.retrieveEvent.mockImplementationOnce(async () => {
      entered();
      await gate;
      return item;
    });
    const processing = worker.processDueOnce();
    await enteredProvider;
    stripe.constructWebhookEvent.mockReturnValue(item);
    await expect(controller.handleWebhook(request)).resolves.toMatchObject({ received: true });
    release();
    await processing;
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(1);
    expect(await prisma.billingStripeFeeEffect.count({ where: { sourceStripeEventId: item.id } })).toBe(1);
    expect(await prisma.billingFinancialEvidenceCase.findFirstOrThrow({
      where: { sourceStripeEventId: item.id },
    })).toMatchObject({ state: 'resolved_effect' });
    expect(await prisma.activityLog.count({ where: { action: 'admin.webhook.retry', targetId: delivery.id } })).toBe(1);
    expect(await prisma.billingDailyStripeFeeMetric.findUniqueOrThrow({
      where: { day_currency: { day: feeDay, currency: 'usd' } },
    })).toMatchObject({ feeMinor: -50n, feeEffectCount: 2 });
  });
});

import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { BillingService } from '../src/modules/billing/application/billing.service';
import { BillingVerifiedWebhookService, BILLING_VERIFIED_WEBHOOK_BOUNDARY_ID } from '../src/modules/billing/application/billing-verified-webhook.service';
import { BillingController } from '../src/modules/billing/interface/billing.controller';
import { BillingFinancialMetricsRecorderService, BILLING_FINANCIAL_METRICS_BOUNDARY_ID } from '../src/modules/billing/application/billing-financial-metrics-recorder.service';
import { AdminVerifiedWebhooksService } from '../src/modules/admin/application/admin-verified-webhooks.service';

const run = `verified${process.pid}${Date.now()}`;
const today = () => new Date().toISOString().slice(0, 10);

describe('Billing verified webhook inspection PostgreSQL integration', () => {
  let prisma: PrismaService;
  let verified: BillingVerifiedWebhookService;
  let controller: BillingController;
  let billing: BillingService;
  let eventIds: string[];
  let paidDay: Date | undefined;
  const paidUserEmail = `${run}@example.test`;
  const paidSubscriptionId = `sub_${run}`;
  const stripe = { constructWebhookEvent: jest.fn() };
  const fees = { prepare: jest.fn(), recordInTransaction: jest.fn() };
  const request = { headers: { 'stripe-signature': 'synthetic-signature' },
    rawBody: Buffer.from('{}') } as unknown as RawBodyRequest<Request>;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) throw new Error('Isolated test DATABASE_URL required');
    prisma = new PrismaService();
    await prisma.$connect();
    const boundary = await prisma.billingVerifiedWebhookBoundary.findUniqueOrThrow({
      where: { id: BILLING_VERIFIED_WEBHOOK_BOUNDARY_ID },
    });
    expect(boundary.startsAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await prisma.billingVerifiedWebhookDelivery.count({})).toBe(0);
    verified = new BillingVerifiedWebhookService(prisma);
    billing = new BillingService(prisma, {} as never, {} as never, {} as never,
      fees as never, undefined, undefined, verified);
    controller = new BillingController(billing, stripe as never, verified);
    eventIds = [];
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.billingVerifiedWebhookDelivery.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.billingFinancialEvent.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.billingInvoiceFinancialOutcome.deleteMany({ where: { sourceStripeEventId: { in: eventIds } } });
    await prisma.stripeWebhookEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { email: paidUserEmail } });
    if (paidDay) await prisma.billingDailyFinancialMetric.deleteMany({ where: { day: paidDay } });
    await prisma.$disconnect();
  });

  beforeEach(() => { jest.clearAllMocks(); fees.prepare.mockResolvedValue(null); });

  function event(suffix: string) {
    const id = `evt_${run}${suffix}`;
    eventIds.push(id);
    return { id, type: 'invoice.payment_failed', data: { object: {
      id: `in_${run}${suffix}`, subscription: null,
    } } };
  }

  it('captures only verified failures, distinguishes pre-receipt failure and later resolution', async () => {
    const item = event('before');
    stripe.constructWebhookEvent.mockImplementationOnce(() => { throw new Error('invalid signature'); });
    await expect(controller.handleWebhook(request)).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.billingVerifiedWebhookDelivery.count({ where: { eventId: item.id } })).toBe(0);

    stripe.constructWebhookEvent.mockReturnValue(item);
    let entered!: () => void;
    let failLookup!: () => void;
    const lookupEntered = new Promise<void>((resolve) => { entered = resolve; });
    fees.prepare.mockImplementationOnce(() => {
      entered();
      return new Promise((_resolve, reject) => {
        failLookup = () => reject(new Stripe.errors.StripeConnectionError({
          type: 'api_error', message: 'private provider failure',
        }));
      });
    });
    const processing = controller.handleWebhook(request);
    await lookupEntered;
    const inFlight = await verified.list({ from: today(), to: today(), limit: 20 });
    expect(inFlight.items).toEqual(expect.arrayContaining([expect.objectContaining({
      status: 'unresolved', reason: 'processing_outcome_unknown',
    })]));
    expect(inFlight.items.some((row) => Math.abs(Date.now() - Date.parse(row.observedAt)) < 60_000)).toBe(true);
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(0);
    failLookup();
    await expect(processing).rejects.toBeInstanceOf(Stripe.errors.StripeConnectionError);
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(0);
    const first = await verified.list({ from: today(), to: today(), limit: 20 });
    const failure = first.items.find((row) => row.eventType === item.type);
    expect(failure).toMatchObject({ status: 'retryable', reason: 'provider_unavailable' });
    expect(JSON.stringify(first)).not.toMatch(new RegExp(`${item.id}|private provider failure|synthetic-signature`));

    await controller.handleWebhook(request);
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(1);
    const second = await verified.list({ from: today(), to: today(), limit: 20 });
    expect(second.items.find((row) => row.id === failure?.id)).toMatchObject({
      status: 'resolved', reason: 'provider_unavailable',
    });
    expect(await prisma.billingVerifiedWebhookDelivery.findUniqueOrThrow({
      where: { id: failure!.id }, select: { state: true, resolvedAt: true },
    })).toMatchObject({ state: 'retryable_failure', resolvedAt: expect.any(Date) });
    expect(second.items.some((row) => row.id === failure?.id)).toBe(true);
  });

  it('keeps one receipt under concurrent verified deliveries and suppresses successful-only rows', async () => {
    const item = event('concurrent');
    stripe.constructWebhookEvent.mockReturnValue(item);
    const results = await Promise.all([controller.handleWebhook(request), controller.handleWebhook(request)]);
    expect(results.every((result) => result.received)).toBe(true);
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(1);
    expect(await prisma.billingVerifiedWebhookDelivery.count({ where: { eventId: item.id } })).toBe(2);
    const listed = await verified.list({ from: today(), to: today(), limit: 20 });
    expect(listed.items.every((row) => row.eventType === 'invoice.payment_failed')).toBe(true);
    expect(listed.items.filter((row) => row.status === 'resolved' && row.reason === 'processing_outcome_unknown')).toHaveLength(0);
  });

  it('does not rewrite an in-flight attempt as resolved when another delivery wins first', async () => {
    const item = event('latefailure');
    const failingDelivery = await verified.beginVerified(item as never);
    await billing.handleWebhook(item as never);
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(1);
    await verified.fail(failingDelivery!.id, item.id, new Stripe.errors.StripeConnectionError({
      type: 'api_error', message: 'private provider failure',
    }));
    const row = await prisma.billingVerifiedWebhookDelivery.findUniqueOrThrow({
      where: { id: failingDelivery!.id },
    });
    expect(row).toMatchObject({ state: 'retryable_failure', reason: 'provider_unavailable', resolvedAt: null });
    const listed = await verified.list({ from: today(), to: today(), state: 'retryable' });
    expect(listed.items.find((entry) => entry.id === row.id)).toMatchObject({
      status: 'retryable', reason: 'provider_unavailable',
    });
    expect(JSON.stringify(listed)).not.toContain(item.id);
  });

  it('keeps a held failed attempt separate from a concurrent successful financial effect', async () => {
    const boundary = await prisma.billingFinancialMetricsBoundary.findUniqueOrThrow({
      where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID }, select: { metricsStartAt: true },
    });
    paidDay = new Date(Date.UTC(boundary.metricsStartAt.getUTCFullYear() + 2,
      boundary.metricsStartAt.getUTCMonth(), boundary.metricsStartAt.getUTCDate()));
    await prisma.user.create({ data: { email: paidUserEmail,
      subscription: { create: { plan: SubscriptionPlan.pro, status: SubscriptionStatus.active,
        stripeSubscriptionId: paidSubscriptionId } } } });
    const item = { id: `evt_${run}paideffect`, type: 'invoice.payment_succeeded',
      created: Math.floor(paidDay.getTime() / 1_000), data: { object: {
        id: `in_${run}`, subscription: paidSubscriptionId, payment_intent: `pi_${run}`,
        amount_paid: 1900, amount_due: 1900, currency: 'usd', hosted_invoice_url: null,
      } } };
    eventIds.push(item.id);
    const paidBilling = new BillingService(prisma,
      { retrieveSubscription: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never, new BillingFinancialMetricsRecorderService(), fees as never,
      undefined, undefined, verified);
    const paidController = new BillingController(paidBilling, stripe as never, verified);
    stripe.constructWebhookEvent.mockReturnValue(item);
    let entered!: () => void;
    let failHeld!: () => void;
    const heldAtProvider = new Promise<void>((resolve) => { entered = resolve; });
    fees.prepare.mockImplementationOnce(() => {
      entered();
      return new Promise((_resolve, reject) => {
        failHeld = () => reject(new Stripe.errors.StripeConnectionError({
          type: 'api_error', message: 'private provider failure',
        }));
      });
    });
    const held = paidController.handleWebhook(request);
    await heldAtProvider;
    const heldRow = await prisma.billingVerifiedWebhookDelivery.findFirstOrThrow({
      where: { eventId: item.id }, select: { id: true },
    });
    await expect(paidController.handleWebhook(request)).resolves.toMatchObject({ received: true });
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(1);
    expect(await prisma.billingFinancialEvent.count({
      where: { sourceStripeEventId: item.id },
    })).toBe(1);
    expect(await prisma.billingVerifiedWebhookDelivery.findUniqueOrThrow({
      where: { id: heldRow.id }, select: { state: true, reason: true,
        finishedAt: true, resolvedAt: true },
    })).toEqual({ state: 'processing', reason: null, finishedAt: null, resolvedAt: null });

    failHeld();
    await expect(held).rejects.toBeInstanceOf(Stripe.errors.StripeConnectionError);
    expect(await prisma.billingVerifiedWebhookDelivery.findUniqueOrThrow({
      where: { id: heldRow.id }, select: { state: true, reason: true, resolvedAt: true },
    })).toEqual({ state: 'retryable_failure', reason: 'provider_unavailable', resolvedAt: null });
    const projected = await new AdminVerifiedWebhooksService(verified).list({ from: today(), to: today() });
    expect(projected.items.find((entry) => entry.id === heldRow.id)).toMatchObject({
      status: 'retryable', reason: 'provider_unavailable', resolvedAt: null,
    });
    expect(JSON.stringify(projected)).not.toMatch(new RegExp(`${item.id}|${paidSubscriptionId}|private provider failure`));
    await expect(paidController.handleWebhook(request)).resolves.toMatchObject({ duplicate: true });
    expect(await prisma.billingFinancialEvent.count({
      where: { sourceStripeEventId: item.id },
    })).toBe(1);
    expect(await prisma.billingDailyFinancialMetric.findUniqueOrThrow({
      where: { day_currency: { day: paidDay, currency: 'usd' } },
      select: { grossRevenueMinor: true, successfulPaymentCount: true },
    })).toEqual({ grossRevenueMinor: 1900n, successfulPaymentCount: 1 });
  });

  it('rolls back receipt when resolution write fails after receipt creation', async () => {
    const item = event('rollback');
    stripe.constructWebhookEvent.mockReturnValue(item);
    const original = verified.resolveInTransaction.bind(verified);
    const spy = jest.spyOn(verified, 'resolveInTransaction').mockRejectedValueOnce(new Error('synthetic write failure'));
    await expect(controller.handleWebhook(request)).rejects.toThrow('synthetic write failure');
    spy.mockRestore();
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(0);
    const failed = await prisma.billingVerifiedWebhookDelivery.findFirstOrThrow({ where: { eventId: item.id } });
    expect(failed.state).toBe('unclassified_failure');
    await controller.handleWebhook(request);
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: item.id } })).toBe(1);
    expect(await prisma.billingVerifiedWebhookDelivery.findUniqueOrThrow({
      where: { id: failed.id }, select: { state: true, resolvedAt: true },
    })).toMatchObject({ state: 'unclassified_failure', resolvedAt: expect.any(Date) });
    expect(original).toBeDefined();
  });

  it('does not label deterministic configuration rejection as retryable', async () => {
    const item = event('configuration');
    const delivery = await verified.beginVerified(item as never);
    await verified.fail(delivery!.id, item.id, new ServiceUnavailableException('private configuration detail'));
    const page = await verified.list({ from: today(), to: today(), state: 'unresolved' });
    expect(page.items.find((row) => row.id === delivery!.id)).toMatchObject({
      status: 'unresolved', reason: 'processing_error',
    });
    expect(JSON.stringify(page)).not.toContain('private configuration detail');
  });

  it('paginates only captured issues by opaque local cursor and rejects unbounded ranges', async () => {
    for (let index = 0; index < 22; index += 1) {
      const item = event(`page${index}`);
      const delivery = await verified.beginVerified(item as never);
      await verified.fail(delivery!.id, item.id, new Error('synthetic opaque failure'));
    }
    const first = await verified.list({ from: today(), to: today(), limit: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const second = await verified.list({ from: today(), to: today(), limit: 20, cursor: first.nextCursor! });
    expect(second.items.length).toBeGreaterThan(0);
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(first.items.length + second.items.length);
    expect(JSON.stringify(first)).not.toContain(eventIds[0]);
    await expect(verified.list({ from: '2026-01-01', to: '2026-10-08' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { BillingFinancialMetricsReadService } from '../src/modules/billing/application/billing-financial-metrics-read.service';
import {
  BILLING_FINANCIAL_METRICS_BOUNDARY_ID,
  BillingFinancialMetricsRecorderService,
} from '../src/modules/billing/application/billing-financial-metrics-recorder.service';
import { BillingService } from '../src/modules/billing/application/billing.service';
import { SubscriptionLifecycleService } from '../src/modules/billing/application/subscription-lifecycle.service';

const runId = `financial-metrics-${process.pid}-${Date.now()}`;
const DAY_MS = 24 * 60 * 60 * 1_000;

describe('Billing future-only financial metrics PostgreSQL integration', () => {
  let prisma: PrismaService;
  let billing: BillingService;
  let readService: BillingFinancialMetricsReadService;
  let boundary: Date;
  let eventDay: Date;
  let stripeSubscription: Stripe.Subscription;
  const eventIds = [
    `${runId}-paid`,
    `${runId}-delayed`,
    `${runId}-pre-boundary`,
    `${runId}-failed`,
    `${runId}-rollback`,
  ];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'Integration tests require an isolated DATABASE_URL containing "test"',
      );
    }
    prisma = new PrismaService();
    await prisma.$connect();
    boundary = (
      await prisma.billingFinancialMetricsBoundary.findUniqueOrThrow({
        where: { id: BILLING_FINANCIAL_METRICS_BOUNDARY_ID },
        select: { metricsStartAt: true },
      })
    ).metricsStartAt;
    eventDay = utcDay(new Date(boundary.getTime() + DAY_MS));
    stripeSubscription = {
      id: `${runId}-subscription`,
      status: 'active',
      metadata: { plan: SubscriptionPlan.pro },
      cancel_at_period_end: false,
      current_period_start: Math.floor(eventDay.getTime() / 1_000),
      current_period_end: Math.floor(eventDay.getTime() / 1_000) + 2_592_000,
      canceled_at: null,
    } as unknown as Stripe.Subscription;
    await prisma.user.create({
      data: {
        email: `${runId}@example.test`,
        subscription: {
          create: {
            plan: SubscriptionPlan.pro,
            status: SubscriptionStatus.active,
            stripeSubscriptionId: stripeSubscription.id,
          },
        },
      },
    });
    const stripe = {
      retrieveSubscription: jest.fn(async () => stripeSubscription),
      resolveSubscriptionPlan: jest.fn(() => SubscriptionPlan.pro),
    };
    billing = new BillingService(
      prisma,
      stripe as never,
      new SubscriptionLifecycleService(),
      new BillingFinancialMetricsRecorderService(),
      { now: () => new Date(eventDay.getTime() + 2 * DAY_MS) } as never,
    );
    readService = new BillingFinancialMetricsReadService(prisma);
  });

  afterAll(async () => {
    await prisma?.billingFinancialEvent.deleteMany({
      where: { sourceStripeEventId: { in: eventIds } },
    });
    await prisma?.subscriptionLifecycleEvent.deleteMany({
      where: { sourceStripeEventId: { in: eventIds } },
    });
    await prisma?.stripeWebhookEvent.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma?.user.deleteMany({ where: { email: `${runId}@example.test` } });
    if (eventDay) {
      await prisma?.billingDailyFinancialMetric.deleteMany({
        where: { day: { gte: eventDay, lt: new Date(eventDay.getTime() + 2 * DAY_MS) } },
      });
    }
    await prisma?.$disconnect();
  });

  it('records concurrent duplicates once and buckets delayed delivery by effective Stripe time', async () => {
    const paid = invoiceEvent(eventIds[0]!, eventDay, 1_900, 'pi-paid');
    const results = await Promise.all([
      billing.handleWebhook(paid),
      billing.handleWebhook(paid),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([
        { received: true },
        { received: true, duplicate: true },
      ]),
    );
    await billing.handleWebhook(
      invoiceEvent(
        eventIds[1]!,
        new Date(eventDay.getTime() + 60_000),
        4_900,
        'pi-delayed',
      ),
    );
    await billing.handleWebhook(
      invoiceEvent(
        eventIds[2]!,
        new Date(boundary.getTime() - 1_000),
        9_999,
        'pi-pre-boundary',
      ),
    );
    await billing.handleWebhook(
      invoiceEvent(eventIds[3]!, eventDay, 1_900, 'pi-failed', false),
    );

    await expect(
      prisma.billingFinancialEvent.count({
        where: { sourceStripeEventId: { in: eventIds } },
      }),
    ).resolves.toBe(2);
    const result = await readService.getMetrics({
      from: eventDay,
      toExclusive: new Date(eventDay.getTime() + DAY_MS),
    });
    expect(result.totals).toEqual({
      grossRevenueMinor: 6_800,
      successfulPaymentCount: 2,
    });
    expect(result.daily).toEqual([
      expect.objectContaining({
        day: eventDay.toISOString().slice(0, 10),
        grossRevenueMinor: 6_800,
        successfulPaymentCount: 2,
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /stripe|invoice|customer|paymentId|email|userId|url|prompt|resume|cv|token|credential|secret|provider/i,
    );
  });

  it('rolls back webhook and payment state when financial persistence fails', async () => {
    const throwingRecorder = {
      recordSuccessfulInvoiceInTransaction: jest.fn(async () => {
        throw new Error('synthetic financial persistence failure');
      }),
    };
    const rollbackBilling = new BillingService(
      prisma,
      {
        retrieveSubscription: jest.fn(async () => stripeSubscription),
        resolveSubscriptionPlan: jest.fn(() => SubscriptionPlan.pro),
      } as never,
      new SubscriptionLifecycleService(),
      throwingRecorder as never,
      { now: () => new Date(eventDay.getTime() + DAY_MS) } as never,
    );
    await expect(
      rollbackBilling.handleWebhook(
        invoiceEvent(eventIds[4]!, eventDay, 1_900, 'pi-rollback'),
      ),
    ).rejects.toThrow('synthetic financial persistence failure');
    await expect(
      prisma.stripeWebhookEvent.findUnique({ where: { eventId: eventIds[4] } }),
    ).resolves.toBeNull();
    await expect(
      prisma.payment.findUnique({ where: { stripePaymentId: 'pi-rollback' } }),
    ).resolves.toBeNull();
  });
});

function invoiceEvent(
  id: string,
  effectiveAt: Date,
  amountMinor: number,
  paymentIntent: string,
  succeeded = true,
): Stripe.Event {
  return {
    id,
    type: succeeded ? 'invoice.payment_succeeded' : 'invoice.payment_failed',
    created: Math.floor(effectiveAt.getTime() / 1_000),
    data: {
      object: {
        id: `${id}-invoice`,
        subscription: `${runId}-subscription`,
        payment_intent: paymentIntent,
        amount_paid: succeeded ? amountMinor : 0,
        amount_due: amountMinor,
        currency: 'usd',
        hosted_invoice_url: 'https://invoice.example.test/private',
      },
    },
  } as unknown as Stripe.Event;
}

function utcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

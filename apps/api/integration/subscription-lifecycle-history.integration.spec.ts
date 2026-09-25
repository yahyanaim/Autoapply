import {
  SubscriptionLifecycleEventCategory,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { BillingMetricsReadService } from '../src/modules/billing/application/billing-metrics-read.service';
import { BillingService } from '../src/modules/billing/application/billing.service';
import {
  BILLING_HISTORY_BOUNDARY_ID,
  SubscriptionLifecycleService,
} from '../src/modules/billing/application/subscription-lifecycle.service';
import { PLAN_PRICING } from '../src/modules/billing/domain/plan-pricing';

const runId = `subscription-lifecycle-${process.pid}-${Date.now()}`;
const DAY_MS = 24 * 60 * 60 * 1_000;

describe('Billing subscription lifecycle PostgreSQL integration', () => {
  let prisma: PrismaService;
  let lifecycle: SubscriptionLifecycleService;
  let metrics: BillingMetricsReadService;
  let billing: BillingService;
  let currentStripeSubscription: Stripe.Subscription;
  let rangeFrom: Date;
  let rangeToExclusive: Date;
  let eventTimestampSeconds: number;
  const eventIds = [
    `${runId}-activation`,
    `${runId}-upgrade`,
    `${runId}-deletion`,
    `${runId}-duplicate`,
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
    lifecycle = new SubscriptionLifecycleService();
    const boundary =
      await prisma.billingMetricsHistoryBoundary.findUniqueOrThrow({
        where: { id: BILLING_HISTORY_BOUNDARY_ID },
      });
    const boundaryDay = utcDay(boundary.historyAvailableFrom);
    rangeFrom = new Date(boundaryDay.getTime() + 2 * DAY_MS);
    rangeToExclusive = new Date(rangeFrom.getTime() + 3 * DAY_MS);
    eventTimestampSeconds = Math.floor(rangeFrom.getTime() / 1_000) + 60;

    currentStripeSubscription = stripeSubscription('pro', 'active');
    const stripe = {
      retrieveSubscription: jest.fn(async () => currentStripeSubscription),
      resolveSubscriptionPlan: jest.fn(
        (subscription: Stripe.Subscription) =>
          subscription.metadata.plan as SubscriptionPlan,
      ),
    };
    billing = new BillingService(prisma, stripe as never, lifecycle, {
      now: () => new Date(rangeFrom.getTime() + 120_000),
    } as never);
    metrics = new BillingMetricsReadService(prisma, {
      now: () => new Date(rangeToExclusive.getTime()),
    } as never);

    const user = await prisma.user.create({
      data: {
        email: `${runId}-owner@example.test`,
        subscription: {
          create: {
            plan: SubscriptionPlan.free,
            status: SubscriptionStatus.active,
            stripeSubscriptionId: `${runId}-stripe-subscription`,
          },
        },
      },
      include: { subscription: true },
    });
    expect(user.subscription).not.toBeNull();
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({
      where: { email: { startsWith: runId } },
    });
    await prisma?.subscriptionLifecycleEvent.deleteMany({
      where: { sourceStripeEventId: { in: eventIds } },
    });
    await prisma?.stripeWebhookEvent.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    if (rangeFrom && rangeToExclusive) {
      await prisma?.billingDailySubscriptionMetric.deleteMany({
        where: { day: { gte: rangeFrom, lt: rangeToExclusive } },
      });
    }
    await prisma?.$disconnect();
  });

  it('persists ordered future transitions and reconstructs bounded historical MRR and churn', async () => {
    await billing.handleWebhook(
      subscriptionUpdatedEvent(
        eventIds[0]!,
        stripeSubscription('pro', 'active'),
        eventTimestampSeconds,
      ),
    );
    currentStripeSubscription = stripeSubscription('premium', 'active');
    await billing.handleWebhook(
      subscriptionUpdatedEvent(
        eventIds[1]!,
        currentStripeSubscription,
        eventTimestampSeconds,
      ),
    );
    const deleted = stripeSubscription('premium', 'canceled', {
      canceledAt: eventTimestampSeconds + 86_400,
    });
    await billing.handleWebhook({
      id: eventIds[2],
      type: 'customer.subscription.deleted',
      created: eventTimestampSeconds + 86_400,
      data: { object: deleted },
    } as Stripe.Event);

    const events = await prisma.subscriptionLifecycleEvent.findMany({
      where: { sourceStripeEventId: { in: eventIds.slice(0, 3) } },
      orderBy: [{ effectiveAt: 'asc' }, { sequence: 'asc' }],
      select: {
        sequence: true,
        sourceStripeEventId: true,
        category: true,
        previousPriceUsdMinor: true,
        nextPriceUsdMinor: true,
        currency: true,
      },
    });
    expect(events).toEqual([
      expect.objectContaining({
        sourceStripeEventId: eventIds[0],
        category: SubscriptionLifecycleEventCategory.paid_activation,
        previousPriceUsdMinor: null,
        nextPriceUsdMinor: PLAN_PRICING.pro.unitAmount,
        currency: 'usd',
      }),
      expect.objectContaining({
        sourceStripeEventId: eventIds[1],
        category: SubscriptionLifecycleEventCategory.plan_upgrade,
        previousPriceUsdMinor: PLAN_PRICING.pro.unitAmount,
        nextPriceUsdMinor: PLAN_PRICING.premium.unitAmount,
      }),
      expect.objectContaining({
        sourceStripeEventId: eventIds[2],
        category: SubscriptionLifecycleEventCategory.subscription_deletion,
        previousPriceUsdMinor: PLAN_PRICING.premium.unitAmount,
        nextPriceUsdMinor: null,
      }),
    ]);
    expect(events[0]!.sequence < events[1]!.sequence).toBe(true);
    expect(events[1]!.sequence < events[2]!.sequence).toBe(true);

    const history = await metrics.getHistoricalMetrics({
      from: rangeFrom,
      toExclusive: rangeToExclusive,
    });
    expect(history.requestedRangeStartsBeforeHistory).toBe(false);
    expect(history.totals).toEqual({
      newPaidSubscriptions: 1,
      expansionMrrMinor:
        PLAN_PRICING.premium.unitAmount - PLAN_PRICING.pro.unitAmount,
      contractionMrrMinor: 0,
      churnCount: 1,
      churnedMrrMinor: PLAN_PRICING.premium.unitAmount,
      reactivationCount: 0,
    });
    expect(history.daily).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          day: rangeFrom.toISOString().slice(0, 10),
          monthlyRecurringRevenueMinor: PLAN_PRICING.premium.unitAmount,
          newPaidSubscriptions: 1,
          expansionMrrMinor:
            PLAN_PRICING.premium.unitAmount - PLAN_PRICING.pro.unitAmount,
        }),
        expect.objectContaining({
          day: new Date(rangeFrom.getTime() + DAY_MS)
            .toISOString()
            .slice(0, 10),
          monthlyRecurringRevenueMinor: 0,
          churnCount: 1,
          churnedMrrMinor: PLAN_PRICING.premium.unitAmount,
        }),
      ]),
    );
    expect(JSON.stringify(history)).not.toMatch(
      /stripe|invoice|customer|email|token|credential|secret|paymentInstrument/i,
    );
  });

  it('admits concurrent duplicate delivery once and rolls back state when lifecycle persistence fails', async () => {
    currentStripeSubscription = stripeSubscription('free', 'canceled');
    const duplicateEvent = subscriptionUpdatedEvent(
      eventIds[3]!,
      currentStripeSubscription,
      eventTimestampSeconds + 172_800,
    );
    const duplicateResults = await Promise.all([
      billing.handleWebhook(duplicateEvent),
      billing.handleWebhook(duplicateEvent),
    ]);
    expect(duplicateResults).toEqual(
      expect.arrayContaining([
        { received: true },
        { received: true, duplicate: true },
      ]),
    );
    await expect(
      prisma.subscriptionLifecycleEvent.count({
        where: { sourceStripeEventId: eventIds[3] },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.stripeWebhookEvent.count({
        where: { eventId: eventIds[3] },
      }),
    ).resolves.toBe(1);

    const rollbackOwner = await prisma.user.create({
      data: {
        email: `${runId}-rollback@example.test`,
        subscription: {
          create: {
            plan: SubscriptionPlan.free,
            status: SubscriptionStatus.active,
            stripeSubscriptionId: `${runId}-rollback-subscription`,
          },
        },
      },
      include: { subscription: true },
    });
    const rollbackStripeSubscription = stripeSubscription('pro', 'active', {
      id: `${runId}-rollback-subscription`,
    });
    const throwingLifecycle = {
      recordInTransaction: jest.fn(async () => {
        throw new Error('synthetic lifecycle persistence failure');
      }),
    };
    const rollbackBilling = new BillingService(
      prisma,
      {
        retrieveSubscription: jest.fn(async () => rollbackStripeSubscription),
        resolveSubscriptionPlan: jest.fn(() => SubscriptionPlan.pro),
      } as never,
      throwingLifecycle as never,
      { now: () => new Date(rangeFrom.getTime() + 240_000) } as never,
    );

    await expect(
      rollbackBilling.handleWebhook(
        subscriptionUpdatedEvent(
          eventIds[4]!,
          rollbackStripeSubscription,
          eventTimestampSeconds + 172_900,
        ),
      ),
    ).rejects.toThrow('synthetic lifecycle persistence failure');
    await expect(
      prisma.subscription.findUniqueOrThrow({
        where: { id: rollbackOwner.subscription!.id },
        select: { plan: true, status: true },
      }),
    ).resolves.toEqual({
      plan: SubscriptionPlan.free,
      status: SubscriptionStatus.active,
    });
    await expect(
      prisma.stripeWebhookEvent.findUnique({
        where: { eventId: eventIds[4] },
      }),
    ).resolves.toBeNull();
  });
});

function stripeSubscription(
  plan: SubscriptionPlan,
  status: Stripe.Subscription.Status,
  options: { id?: string; canceledAt?: number } = {},
): Stripe.Subscription {
  return {
    id: options.id ?? `${runId}-stripe-subscription`,
    status,
    metadata: { plan },
    cancel_at_period_end: false,
    current_period_start: 1_700_000_000,
    current_period_end: 1_702_592_000,
    canceled_at: options.canceledAt ?? null,
  } as unknown as Stripe.Subscription;
}

function subscriptionUpdatedEvent(
  id: string,
  subscription: Stripe.Subscription,
  created: number,
): Stripe.Event {
  return {
    id,
    type: 'customer.subscription.updated',
    created,
    data: { object: subscription },
  } as unknown as Stripe.Event;
}

function utcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

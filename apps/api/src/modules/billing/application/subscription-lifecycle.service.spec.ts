import {
  SubscriptionLifecycleEventCategory,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PLAN_PRICING } from '../domain/plan-pricing';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

describe('SubscriptionLifecycleService', () => {
  const boundary = new Date('2026-09-26T12:00:00.000Z');
  const transaction = {
    billingMetricsHistoryBoundary: {
      findUniqueOrThrow: jest.fn(),
    },
    subscriptionLifecycleEvent: { create: jest.fn() },
    billingDailySubscriptionMetric: { upsert: jest.fn() },
  };
  let service: SubscriptionLifecycleService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.billingMetricsHistoryBoundary.findUniqueOrThrow.mockResolvedValue(
      { historyAvailableFrom: boundary },
    );
    transaction.subscriptionLifecycleEvent.create.mockResolvedValue({
      id: 'event-1',
      sequence: 1n,
      category: SubscriptionLifecycleEventCategory.observation,
    });
    transaction.billingDailySubscriptionMetric.upsert.mockResolvedValue({});
    service = new SubscriptionLifecycleService();
  });

  it.each([
    {
      name: 'paid activation',
      previous: state(SubscriptionPlan.free, SubscriptionStatus.active),
      next: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      category: SubscriptionLifecycleEventCategory.paid_activation,
      movement: { newPaidSubscriptions: 1 },
    },
    {
      name: 'plan upgrade',
      previous: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      next: state(SubscriptionPlan.premium, SubscriptionStatus.active),
      category: SubscriptionLifecycleEventCategory.plan_upgrade,
      movement: {
        expansionMrrMinor:
          PLAN_PRICING.premium.unitAmount - PLAN_PRICING.pro.unitAmount,
      },
    },
    {
      name: 'plan downgrade',
      previous: state(SubscriptionPlan.premium, SubscriptionStatus.active),
      next: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      category: SubscriptionLifecycleEventCategory.plan_downgrade,
      movement: {
        contractionMrrMinor:
          PLAN_PRICING.premium.unitAmount - PLAN_PRICING.pro.unitAmount,
      },
    },
    {
      name: 'cancellation',
      previous: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      next: state(SubscriptionPlan.free, SubscriptionStatus.canceled),
      category: SubscriptionLifecycleEventCategory.cancellation,
      movement: {
        churnCount: 1,
        churnedMrrMinor: PLAN_PRICING.pro.unitAmount,
      },
    },
    {
      name: 'reactivation',
      previous: state(SubscriptionPlan.free, SubscriptionStatus.canceled),
      next: state(SubscriptionPlan.premium, SubscriptionStatus.active),
      category: SubscriptionLifecycleEventCategory.reactivation,
      movement: { reactivationCount: 1 },
    },
    {
      name: 'trial start',
      previous: state(SubscriptionPlan.free, SubscriptionStatus.active),
      next: state(SubscriptionPlan.pro, SubscriptionStatus.trialing),
      category: SubscriptionLifecycleEventCategory.trial_start,
      movement: {},
    },
    {
      name: 'trial conversion',
      previous: state(SubscriptionPlan.pro, SubscriptionStatus.trialing),
      next: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      category: SubscriptionLifecycleEventCategory.trial_conversion,
      movement: { newPaidSubscriptions: 1 },
    },
    {
      name: 'past due transition',
      previous: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      next: state(SubscriptionPlan.pro, SubscriptionStatus.past_due),
      category: SubscriptionLifecycleEventCategory.past_due_transition,
      movement: {},
    },
    {
      name: 'pause transition',
      previous: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      next: state(SubscriptionPlan.free, SubscriptionStatus.paused),
      category: SubscriptionLifecycleEventCategory.pause_transition,
      movement: {},
    },
    {
      name: 'unpaid transition',
      previous: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      next: state(SubscriptionPlan.free, SubscriptionStatus.unpaid),
      category: SubscriptionLifecycleEventCategory.unpaid_transition,
      movement: {},
    },
  ])('records $name with its immutable price snapshot', async (scenario) => {
    const effectiveAt = new Date('2026-09-27T05:00:00.000Z');
    await service.recordInTransaction(transaction as never, {
      subscriptionId: 'subscription-1',
      sourceStripeEventId: `stripe-${scenario.name}`,
      previous: scenario.previous,
      next: scenario.next,
      effectiveAt,
      observedAt: new Date('2026-09-27T05:01:00.000Z'),
    });

    expect(transaction.subscriptionLifecycleEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subscriptionId: 'subscription-1',
        sourceStripeEventId: `stripe-${scenario.name}`,
        category: scenario.category,
        previousPlan: scenario.previous.plan,
        previousStatus: scenario.previous.status,
        nextPlan: scenario.next.plan,
        nextStatus: scenario.next.status,
        previousPriceUsdMinor: price(scenario.previous.plan),
        nextPriceUsdMinor: price(scenario.next.plan),
        currency: 'usd',
        effectiveAt,
      }),
      select: { id: true, sequence: true, category: true },
    });
    expect(transaction.billingDailySubscriptionMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining(scenario.movement),
      }),
    );
  });

  it('records deletion at the effective cancellation time and counts paid churn', async () => {
    const effectiveAt = new Date('2026-09-28T00:00:00.000Z');
    await service.recordInTransaction(transaction as never, {
      subscriptionId: 'subscription-1',
      sourceStripeEventId: 'stripe-delete',
      previous: state(SubscriptionPlan.premium, SubscriptionStatus.active),
      next: state(SubscriptionPlan.free, SubscriptionStatus.canceled),
      effectiveAt,
      observedAt: new Date('2026-09-28T00:02:00.000Z'),
      sourceCategory: 'subscription_deletion',
    });

    expect(transaction.subscriptionLifecycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: SubscriptionLifecycleEventCategory.subscription_deletion,
          effectiveAt,
        }),
      }),
    );
    expect(transaction.billingDailySubscriptionMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          churnCount: 1,
          churnedMrrMinor: PLAN_PRICING.premium.unitAmount,
        }),
      }),
    );
  });

  it('records a no-state-change webhook as a zero-delta observation', async () => {
    const unchanged = state(SubscriptionPlan.pro, SubscriptionStatus.active);
    await service.recordInTransaction(transaction as never, {
      subscriptionId: 'subscription-1',
      sourceStripeEventId: 'stripe-observation',
      previous: unchanged,
      next: unchanged,
      effectiveAt: new Date('2026-09-28T00:00:00.000Z'),
      observedAt: new Date('2026-09-28T00:00:01.000Z'),
    });

    expect(transaction.subscriptionLifecycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: SubscriptionLifecycleEventCategory.observation,
        }),
      }),
    );
    expect(transaction.billingDailySubscriptionMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          activePaidDelta: 0,
          monthlyRecurringRevenueDeltaMinor: 0,
          newPaidSubscriptions: 0,
          churnCount: 0,
        }),
      }),
    );
  });

  it.each([
    ['stale authoritative payload', false, true],
    ['event before the migration boundary', true, false],
  ])('records %s only as an observation at processing time', async (_name, before, override) => {
    const observedAt = new Date('2026-09-27T10:00:00.000Z');
    await service.recordInTransaction(transaction as never, {
      subscriptionId: 'subscription-1',
      sourceStripeEventId: `stripe-observation-${before}`,
      previous: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      next: state(SubscriptionPlan.premium, SubscriptionStatus.active),
      effectiveAt: before
        ? new Date('2026-09-25T00:00:00.000Z')
        : new Date('2026-09-27T09:00:00.000Z'),
      observedAt,
      authoritativeOverride: override,
    });

    expect(transaction.subscriptionLifecycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: SubscriptionLifecycleEventCategory.observation,
          effectiveAt: observedAt,
        }),
      }),
    );
  });

  it('uses strict projections and never persists provider payloads or sensitive metadata', async () => {
    await service.recordInTransaction(transaction as never, {
      subscriptionId: 'subscription-1',
      sourceStripeEventId: 'stripe-safe',
      previous: state(SubscriptionPlan.free, SubscriptionStatus.active),
      next: state(SubscriptionPlan.pro, SubscriptionStatus.active),
      effectiveAt: new Date('2026-09-27T00:00:00.000Z'),
      observedAt: new Date('2026-09-27T00:00:01.000Z'),
    });

    const persisted = transaction.subscriptionLifecycleEvent.create.mock.calls[0]?.[0];
    expect(JSON.stringify(persisted)).not.toMatch(
      /payload|invoiceUrl|paymentInstrument|webhookSignature|credential|token|secret|email|description/i,
    );
    expect(transaction.billingMetricsHistoryBoundary.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'subscription_lifecycle_v1' },
      select: { historyAvailableFrom: true },
    });
  });
});

function state(plan: SubscriptionPlan, status: SubscriptionStatus) {
  return { plan, status };
}

function price(plan: SubscriptionPlan): number | null {
  return plan === SubscriptionPlan.pro || plan === SubscriptionPlan.premium
    ? PLAN_PRICING[plan].unitAmount
    : null;
}

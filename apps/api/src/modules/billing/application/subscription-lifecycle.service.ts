import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SubscriptionLifecycleEventCategory,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PLAN_PRICING } from '../domain/plan-pricing';

export const BILLING_HISTORY_BOUNDARY_ID = 'subscription_lifecycle_v1';

export interface SubscriptionLifecycleState {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
}

export interface RecordSubscriptionLifecycleInput {
  subscriptionId: string;
  sourceStripeEventId: string;
  previous: SubscriptionLifecycleState;
  next: SubscriptionLifecycleState;
  effectiveAt: Date;
  observedAt: Date;
  sourceCategory?: 'subscription_deletion';
  authoritativeOverride?: boolean;
}

@Injectable()
export class SubscriptionLifecycleService {
  async recordInTransaction(
    transaction: Prisma.TransactionClient,
    input: RecordSubscriptionLifecycleInput,
  ) {
    const boundary =
      await transaction.billingMetricsHistoryBoundary.findUniqueOrThrow({
        where: { id: BILLING_HISTORY_BOUNDARY_ID },
        select: { historyAvailableFrom: true },
      });
    const beforeBoundary = input.effectiveAt < boundary.historyAvailableFrom;
    const observedOnly = input.authoritativeOverride || beforeBoundary;
    const category = observedOnly
      ? SubscriptionLifecycleEventCategory.observation
      : this.category(input);
    const previousPriceUsdMinor = this.price(input.previous.plan);
    const nextPriceUsdMinor = this.price(input.next.plan);

    const event = await transaction.subscriptionLifecycleEvent.create({
      data: {
        subscriptionId: input.subscriptionId,
        sourceStripeEventId: input.sourceStripeEventId,
        category,
        previousStatus: input.previous.status,
        nextStatus: input.next.status,
        previousPlan: input.previous.plan,
        nextPlan: input.next.plan,
        previousPriceUsdMinor,
        nextPriceUsdMinor,
        currency: 'usd',
        effectiveAt: observedOnly ? input.observedAt : input.effectiveAt,
        observedAt: input.observedAt,
      },
      select: { id: true, sequence: true, category: true },
    });

    const previousMrr = this.monthlyRecurringRevenue(
      input.previous,
      previousPriceUsdMinor,
    );
    const nextMrr = this.monthlyRecurringRevenue(
      input.next,
      nextPriceUsdMinor,
    );
    const previousActive = previousMrr > 0 ? 1 : 0;
    const nextActive = nextMrr > 0 ? 1 : 0;
    const day = this.utcDay(observedOnly ? input.observedAt : input.effectiveAt);
    const movement = this.movement(category, previousMrr, nextMrr);
    const values = {
      activePaidDelta: nextActive - previousActive,
      activeProDelta:
        this.activePlan(input.next, SubscriptionPlan.pro) -
        this.activePlan(input.previous, SubscriptionPlan.pro),
      activePremiumDelta:
        this.activePlan(input.next, SubscriptionPlan.premium) -
        this.activePlan(input.previous, SubscriptionPlan.premium),
      monthlyRecurringRevenueDeltaMinor: nextMrr - previousMrr,
      ...movement,
    };

    await transaction.billingDailySubscriptionMetric.upsert({
      where: { day_currency: { day, currency: 'usd' } },
      create: { day, currency: 'usd', ...values },
      update: {
        activePaidDelta: { increment: values.activePaidDelta },
        activeProDelta: { increment: values.activeProDelta },
        activePremiumDelta: { increment: values.activePremiumDelta },
        monthlyRecurringRevenueDeltaMinor: {
          increment: values.monthlyRecurringRevenueDeltaMinor,
        },
        newPaidSubscriptions: { increment: values.newPaidSubscriptions },
        expansionMrrMinor: { increment: values.expansionMrrMinor },
        contractionMrrMinor: { increment: values.contractionMrrMinor },
        churnCount: { increment: values.churnCount },
        churnedMrrMinor: { increment: values.churnedMrrMinor },
        reactivationCount: { increment: values.reactivationCount },
      },
    });
    return event;
  }

  private category(
    input: RecordSubscriptionLifecycleInput,
  ): SubscriptionLifecycleEventCategory {
    if (input.sourceCategory === 'subscription_deletion') {
      return SubscriptionLifecycleEventCategory.subscription_deletion;
    }
    const previous = input.previous;
    const next = input.next;
    if (previous.status === next.status && previous.plan === next.plan) {
      return SubscriptionLifecycleEventCategory.observation;
    }
    if (
      next.status === SubscriptionStatus.trialing &&
      previous.status !== SubscriptionStatus.trialing
    ) {
      return SubscriptionLifecycleEventCategory.trial_start;
    }
    if (
      previous.status === SubscriptionStatus.trialing &&
      next.status === SubscriptionStatus.active &&
      this.isPaid(next.plan)
    ) {
      return SubscriptionLifecycleEventCategory.trial_conversion;
    }
    if (
      next.status === SubscriptionStatus.past_due &&
      previous.status !== SubscriptionStatus.past_due
    ) {
      return SubscriptionLifecycleEventCategory.past_due_transition;
    }
    if (
      next.status === SubscriptionStatus.paused &&
      previous.status !== SubscriptionStatus.paused
    ) {
      return SubscriptionLifecycleEventCategory.pause_transition;
    }
    if (
      next.status === SubscriptionStatus.unpaid &&
      previous.status !== SubscriptionStatus.unpaid
    ) {
      return SubscriptionLifecycleEventCategory.unpaid_transition;
    }
    if (
      next.status === SubscriptionStatus.canceled &&
      previous.status !== SubscriptionStatus.canceled
    ) {
      return SubscriptionLifecycleEventCategory.cancellation;
    }
    if (next.status === SubscriptionStatus.active && this.isPaid(next.plan)) {
      if (
        previous.status === SubscriptionStatus.canceled ||
        previous.status === SubscriptionStatus.paused ||
        previous.status === SubscriptionStatus.unpaid
      ) {
        return SubscriptionLifecycleEventCategory.reactivation;
      }
      if (
        previous.status === SubscriptionStatus.active &&
        this.isPaid(previous.plan)
      ) {
        const previousPrice = this.price(previous.plan) ?? 0;
        const nextPrice = this.price(next.plan) ?? 0;
        if (nextPrice > previousPrice) {
          return SubscriptionLifecycleEventCategory.plan_upgrade;
        }
        if (nextPrice < previousPrice) {
          return SubscriptionLifecycleEventCategory.plan_downgrade;
        }
      }
      if (!this.isPaid(previous.plan)) {
        return SubscriptionLifecycleEventCategory.paid_activation;
      }
    }
    return SubscriptionLifecycleEventCategory.observation;
  }

  private movement(
    category: SubscriptionLifecycleEventCategory,
    previousMrr: number,
    nextMrr: number,
  ) {
    const newPaidSubscriptions =
      category === SubscriptionLifecycleEventCategory.paid_activation ||
      category === SubscriptionLifecycleEventCategory.trial_conversion
        ? 1
        : 0;
    const expansionMrrMinor =
      category === SubscriptionLifecycleEventCategory.plan_upgrade
        ? Math.max(nextMrr - previousMrr, 0)
        : 0;
    const contractionMrrMinor =
      category === SubscriptionLifecycleEventCategory.plan_downgrade
        ? Math.max(previousMrr - nextMrr, 0)
        : 0;
    const churn =
      (category === SubscriptionLifecycleEventCategory.cancellation ||
        category ===
          SubscriptionLifecycleEventCategory.subscription_deletion) &&
      previousMrr > 0;
    return {
      newPaidSubscriptions,
      expansionMrrMinor,
      contractionMrrMinor,
      churnCount: churn ? 1 : 0,
      churnedMrrMinor: churn ? previousMrr : 0,
      reactivationCount:
        category === SubscriptionLifecycleEventCategory.reactivation ? 1 : 0,
    };
  }

  private activePlan(
    state: SubscriptionLifecycleState,
    plan: SubscriptionPlan,
  ): number {
    return state.status === SubscriptionStatus.active && state.plan === plan
      ? 1
      : 0;
  }

  private monthlyRecurringRevenue(
    state: SubscriptionLifecycleState,
    price: number | null,
  ): number {
    return state.status === SubscriptionStatus.active && price !== null
      ? price
      : 0;
  }

  private isPaid(plan: SubscriptionPlan): boolean {
    return (
      plan === SubscriptionPlan.pro || plan === SubscriptionPlan.premium
    );
  }

  private price(plan: SubscriptionPlan): number | null {
    return plan === SubscriptionPlan.pro || plan === SubscriptionPlan.premium
      ? PLAN_PRICING[plan].unitAmount
      : null;
  }

  private utcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}

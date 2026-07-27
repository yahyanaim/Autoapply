import { SubscriptionPlan } from '@prisma/client';

export interface PurchasablePlanPricing {
  unitAmount: number;
  currency: 'usd';
  interval: 'month';
  intervalCount: 1;
}

export type PurchasablePlan = 'pro' | 'premium';

export const PLAN_PRICING: Record<
  PurchasablePlan,
  PurchasablePlanPricing
> = {
  [SubscriptionPlan.pro]: {
    unitAmount: 1_900,
    currency: 'usd',
    interval: 'month',
    intervalCount: 1,
  },
  [SubscriptionPlan.premium]: {
    unitAmount: 4_900,
    currency: 'usd',
    interval: 'month',
    intervalCount: 1,
  },
};

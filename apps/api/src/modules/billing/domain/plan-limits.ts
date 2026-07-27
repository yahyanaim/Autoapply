import { SubscriptionPlan } from '@prisma/client';

export const UNLIMITED_PLAN_LIMIT = 2_147_483_647;

export interface PlanLimits {
  applicationsMax: number;
  aiRequestsMax: number;
  jobDiscoveriesMax: number;
  resumesMax: number;
  storageBytesMax: number;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  [SubscriptionPlan.free]: {
    applicationsMax: 10,
    aiRequestsMax: 50,
    jobDiscoveriesMax: 3,
    resumesMax: 1,
    storageBytesMax: 5 * 1024 * 1024,
  },
  [SubscriptionPlan.pro]: {
    applicationsMax: UNLIMITED_PLAN_LIMIT,
    aiRequestsMax: 500,
    jobDiscoveriesMax: 50,
    resumesMax: 5,
    storageBytesMax: 25 * 1024 * 1024,
  },
  [SubscriptionPlan.premium]: {
    applicationsMax: UNLIMITED_PLAN_LIMIT,
    aiRequestsMax: UNLIMITED_PLAN_LIMIT,
    jobDiscoveriesMax: UNLIMITED_PLAN_LIMIT,
    resumesMax: UNLIMITED_PLAN_LIMIT,
    storageBytesMax: UNLIMITED_PLAN_LIMIT,
  },
};

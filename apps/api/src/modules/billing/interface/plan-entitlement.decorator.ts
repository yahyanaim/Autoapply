import { SetMetadata } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';

export const PLAN_ENTITLEMENT_KEY = 'applyai:plan-entitlement';

export interface PlanEntitlementRequirement {
  minimumPlan: SubscriptionPlan;
  feature: string;
}

export const RequiresPlan = (
  minimumPlan: SubscriptionPlan,
  feature: string,
) =>
  SetMetadata(PLAN_ENTITLEMENT_KEY, {
    minimumPlan,
    feature,
  } satisfies PlanEntitlementRequirement);

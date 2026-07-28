import { SubscriptionPlan } from '@prisma/client';
import {
  PLAN_LIMITS,
  UNLIMITED_PLAN_LIMIT,
} from '../domain/plan-limits';

describe('PLAN_LIMITS', () => {
  it('keeps discovery and existing quotas aligned with public pricing', () => {
    expect(PLAN_LIMITS[SubscriptionPlan.free]).toEqual(
      expect.objectContaining({
        applicationsMax: 10,
        aiRequestsMax: 5,
        resumeOptimizationsMax: 1,
        jobDiscoveriesMax: 3,
        resumesMax: 1,
        storageBytesMax: 5 * 1024 * 1024,
      }),
    );
    expect(PLAN_LIMITS[SubscriptionPlan.pro]).toEqual(
      expect.objectContaining({
        applicationsMax: UNLIMITED_PLAN_LIMIT,
        aiRequestsMax: 500,
        resumeOptimizationsMax: UNLIMITED_PLAN_LIMIT,
        jobDiscoveriesMax: 50,
        resumesMax: 5,
        storageBytesMax: 25 * 1024 * 1024,
      }),
    );
    expect(PLAN_LIMITS[SubscriptionPlan.premium]).toEqual(
      expect.objectContaining({
        applicationsMax: UNLIMITED_PLAN_LIMIT,
        aiRequestsMax: UNLIMITED_PLAN_LIMIT,
        resumeOptimizationsMax: UNLIMITED_PLAN_LIMIT,
        jobDiscoveriesMax: UNLIMITED_PLAN_LIMIT,
        resumesMax: UNLIMITED_PLAN_LIMIT,
        storageBytesMax: 2_147_483_647,
      }),
    );
  });
});

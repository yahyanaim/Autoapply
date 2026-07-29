import { describe, expect, it } from 'vitest';
import { pricingPlans } from './pricing';

describe('public pricing', () => {
  it('keeps the Free marketing copy aligned with enforced quotas', () => {
    const free = pricingPlans.find((plan) => plan.name === 'Free');

    expect(free).toBeDefined();
    expect(free?.currentFeatures).toContain('5 AI requests per month');
    expect(free?.currentFeatures).toContain('1 truthful CV optimization per month');
    expect(free?.currentFeatures).toContain(
      '3 CV-matched discovery runs per month, with up to 20 ranked jobs each',
    );
    expect(free?.currentFeatures.some((feature) => feature.includes('50 AI requests'))).toBe(false);
  });

  it('keeps paid-plan capacity distinct from the Free plan', () => {
    const pro = pricingPlans.find((plan) => plan.name === 'Pro');
    const premium = pricingPlans.find((plan) => plan.name === 'Premium');

    expect(pro?.currentFeatures).toContain('500 AI requests per month');
    expect(premium?.currentFeatures).toContain('Unlimited AI requests');
  });
});

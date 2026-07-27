import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/api-client';

export type SubscriptionPlan = 'free' | 'pro' | 'premium';
export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'trialing'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

export interface Subscription {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  stripeSubscriptionId: string | null;
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    invoiceUrl: string | null;
    createdAt: string;
  }>;
}

const planRank: Record<SubscriptionPlan, number> = {
  free: 0,
  pro: 1,
  premium: 2,
};

const entitledStatuses = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
]);

export function hasMinimumPlan(
  subscription: Subscription | undefined,
  minimumPlan: SubscriptionPlan,
): boolean {
  if (!subscription || !entitledStatuses.has(subscription.status)) return false;
  return planRank[subscription.plan] >= planRank[minimumPlan];
}

export function useSubscription() {
  return useQuery<Subscription>({
    queryKey: ['subscription'],
    queryFn: () => apiClient.get('/billing/subscription'),
  });
}

'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { apiClient } from '@/lib/api/api-client';
import { useSubscription } from '@/lib/api/hooks/use-subscription';
import {
  pricingPlans,
  PublicPricingPlan,
} from '@/lib/pricing';
import {
  PaidPlan,
  readRequestedPaidPlan,
} from '@/lib/post-auth-plan';

const paidPlans = pricingPlans.filter(
  (plan): plan is PublicPricingPlan & { name: 'Pro' | 'Premium' } =>
    plan.name === 'Pro' || plan.name === 'Premium',
);

export default function BillingPage() {
  const [error, setError] = useState('');
  const [requestedPlan, setRequestedPlan] = useState<PaidPlan | null>(null);
  const subscription = useSubscription();
  const checkout = useMutation({ mutationFn: (plan: 'pro' | 'premium') => apiClient.post<{ url: string }>('/billing/checkout-session', { plan }) });
  const portal = useMutation({ mutationFn: () => apiClient.post<{ url: string }>('/billing/portal-session') });

  useEffect(() => {
    setRequestedPlan(readRequestedPaidPlan());
  }, []);

  const redirect = async (action: () => Promise<{ url: string }>) => {
    setError('');
    try {
      const result = await action();
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Billing action failed');
    }
  };

  if (subscription.isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  const hasManageableSubscription = Boolean(
    subscription.data?.stripeSubscriptionId &&
      ['active', 'trialing', 'past_due'].includes(subscription.data.status),
  );

  const selectPlan = (plan: 'pro' | 'premium') => {
    if (hasManageableSubscription) {
      return redirect(() => portal.mutateAsync());
    }
    return redirect(() => checkout.mutateAsync(plan));
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Billing & subscription</h1><p className="mt-1 text-sm text-gray-500">Plans and invoices are securely managed by Stripe.</p></div>
      {(error || subscription.isError) && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error || subscription.error?.message}</div>}
      {requestedPlan && subscription.data?.plan !== requestedPlan && (
        <div className="rounded-lg border border-info-200 bg-info-50 p-3 text-sm text-info-700">
          You selected the <span className="font-semibold capitalize">{requestedPlan}</span>{' '}
          plan. Review its included limits below, then continue securely with Stripe.
        </div>
      )}

      {subscription.data && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-lg font-semibold text-gray-900">Current plan</h2><div className="mt-2 flex items-center gap-2"><span className="text-3xl font-bold capitalize text-gray-900">{subscription.data.plan}</span><Badge variant={subscription.data.status === 'active' || subscription.data.status === 'trialing' ? 'success' : 'warning'}>{subscription.data.status}</Badge></div>{subscription.data.currentPeriodEnd && <p className="mt-2 text-sm text-gray-500">Current period ends {new Date(subscription.data.currentPeriodEnd).toLocaleDateString()}</p>}</div>
            {subscription.data.stripeSubscriptionId && <Button variant="secondary" onClick={() => void redirect(() => portal.mutateAsync())} disabled={portal.isPending}>{portal.isPending ? 'Opening…' : 'Manage in Stripe'}</Button>}
          </div>
        </Card>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2">
        {paidPlans.map((plan) => {
          const planKey = plan.name.toLowerCase() as 'pro' | 'premium';
          const isCurrent = subscription.data?.plan === planKey;
          return (
            <PlanCard
              key={plan.name}
              plan={plan}
              disabled={
                checkout.isPending || portal.isPending || Boolean(isCurrent)
              }
              buttonLabel={
                isCurrent
                  ? 'Current plan'
                  : hasManageableSubscription
                    ? 'Manage or change in Stripe'
                    : `Choose ${plan.name}`
              }
              onSelect={() => void selectPlan(planKey)}
            />
          );
        })}
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-gray-900">Payment history</h2>
        {!subscription.data?.payments.length && <p className="mt-4 text-sm text-gray-500">No payments yet.</p>}
        <div className="mt-3 divide-y divide-gray-100">{subscription.data?.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium text-gray-900">{new Intl.NumberFormat(undefined, { style: 'currency', currency: payment.currency.toUpperCase() }).format(payment.amount / 100)}</p><p className="text-xs text-gray-500">{new Date(payment.createdAt).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><Badge variant={payment.status === 'succeeded' ? 'success' : 'warning'}>{payment.status}</Badge>{payment.invoiceUrl && <a href={payment.invoiceUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary-600">Invoice</a>}</div></div>)}</div>
      </Card>
    </div>
  );
}

function PlanCard({
  plan,
  disabled,
  buttonLabel,
  onSelect,
}: {
  plan: PublicPricingPlan;
  disabled: boolean;
  buttonLabel: string;
  onSelect: () => void;
}) {
  const primaryFeatures = plan.currentFeatures.slice(0, 6);
  const additionalFeatures = plan.currentFeatures.slice(6);
  return (
    <Card>
      <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
      <p className="mt-2">
        <span className="text-3xl font-bold">{plan.price}</span>
        <span className="text-sm text-gray-500">/month</span>
      </p>
      <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
      <ul className="my-5 space-y-2 text-sm text-gray-600">
        {primaryFeatures.map((feature) => (
          <li key={feature}>✓ {feature}</li>
        ))}
      </ul>
      {additionalFeatures.length > 0 && (
        <details className="mb-5 border-t border-gray-100 pt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-primary-600">
            More included features
          </summary>
          <ul className="mt-3 space-y-2 text-gray-600">
            {additionalFeatures.map((feature) => (
              <li key={feature}>✓ {feature}</li>
            ))}
          </ul>
        </details>
      )}
      <Button className="w-full" onClick={onSelect} disabled={disabled}>
        {checkoutLabel(disabled, buttonLabel)}
      </Button>
    </Card>
  );
}

function checkoutLabel(disabled: boolean, label: string) {
  if (!disabled) return label;
  return label === 'Current plan' ? label : 'Processing…';
}

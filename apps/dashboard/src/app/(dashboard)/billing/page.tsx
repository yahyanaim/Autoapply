'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { apiClient } from '@/lib/api/api-client';
import { useSubscription } from '@/lib/api/hooks/use-subscription';

export default function BillingPage() {
  const [error, setError] = useState('');
  const subscription = useSubscription();
  const checkout = useMutation({ mutationFn: (plan: 'pro' | 'premium') => apiClient.post<{ url: string }>('/billing/checkout-session', { plan }) });
  const portal = useMutation({ mutationFn: () => apiClient.post<{ url: string }>('/billing/portal-session') });

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

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Billing & subscription</h1><p className="mt-1 text-sm text-gray-500">Plans and invoices are securely managed by Stripe.</p></div>
      {(error || subscription.isError) && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error || subscription.error?.message}</div>}

      {subscription.data && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-lg font-semibold text-gray-900">Current plan</h2><div className="mt-2 flex items-center gap-2"><span className="text-3xl font-bold capitalize text-gray-900">{subscription.data.plan}</span><Badge variant={subscription.data.status === 'active' || subscription.data.status === 'trialing' ? 'success' : 'warning'}>{subscription.data.status}</Badge></div>{subscription.data.currentPeriodEnd && <p className="mt-2 text-sm text-gray-500">Current period ends {new Date(subscription.data.currentPeriodEnd).toLocaleDateString()}</p>}</div>
            {subscription.data.stripeSubscriptionId && <Button variant="secondary" onClick={() => void redirect(() => portal.mutateAsync())} disabled={portal.isPending}>{portal.isPending ? 'Opening…' : 'Manage in Stripe'}</Button>}
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <PlanCard name="Pro" price="$19" features={['500 AI requests per month', 'Unlimited application tracking', 'Resume optimization']} disabled={checkout.isPending || subscription.data?.plan === 'pro'} onSelect={() => void redirect(() => checkout.mutateAsync('pro'))} />
        <PlanCard name="Premium" price="$49" features={['Unlimited AI requests', 'Unlimited application tracking', 'All AI tools']} disabled={checkout.isPending || subscription.data?.plan === 'premium'} onSelect={() => void redirect(() => checkout.mutateAsync('premium'))} />
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-gray-900">Payment history</h2>
        {!subscription.data?.payments.length && <p className="mt-4 text-sm text-gray-500">No payments yet.</p>}
        <div className="mt-3 divide-y divide-gray-100">{subscription.data?.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium text-gray-900">{new Intl.NumberFormat(undefined, { style: 'currency', currency: payment.currency.toUpperCase() }).format(payment.amount / 100)}</p><p className="text-xs text-gray-500">{new Date(payment.createdAt).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><Badge variant={payment.status === 'succeeded' ? 'success' : 'warning'}>{payment.status}</Badge>{payment.invoiceUrl && <a href={payment.invoiceUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary-600">Invoice</a>}</div></div>)}</div>
      </Card>
    </div>
  );
}

function PlanCard({ name, price, features, disabled, onSelect }: { name: string; price: string; features: string[]; disabled: boolean; onSelect: () => void }) {
  return <Card><h2 className="text-xl font-bold text-gray-900">{name}</h2><p className="mt-2"><span className="text-3xl font-bold">{price}</span><span className="text-sm text-gray-500">/month</span></p><ul className="my-5 space-y-2 text-sm text-gray-600">{features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul><Button className="w-full" onClick={onSelect} disabled={disabled}>{disabled ? 'Current or processing' : `Choose ${name}`}</Button></Card>;
}

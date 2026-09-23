'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Button } from '@/components/ui/Button';

export function AdminOverviewPage() {
  const overview = useQuery({
    queryKey: ['admin-console', 'overview'],
    queryFn: () => adminApiClient.adminConsole.overview(),
  });

  if (overview.isLoading) return <OverviewSkeleton />;
  if (overview.isError) {
    return <OverviewState
      title="Could not load overview"
      detail="The request did not return a safe aggregate summary."
      retry={() => void overview.refetch()}
    />;
  }
  if (!overview.data) return null;

  const count = overview.data.suspendedUserCount;
  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">Admin Console</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-gray-600">Aggregate operational status only.</p>
      </header>
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <article className="border border-stone-200 bg-white p-5" aria-label="Suspended users">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Suspended users</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-gray-950">{count}</p>
            </div>
            <span className={count === 0 ? 'rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-gray-600' : 'rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-800'}>
              {count === 0 ? 'Clear' : 'Attention'}
            </span>
          </div>
          <p className="mt-4 text-sm text-gray-600">{count === 0 ? 'No users are currently suspended.' : 'Accounts currently in the explicit suspended status.'}</p>
        </article>
      </div>
    </section>
  );
}

function OverviewState({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return <section className="border border-stone-200 bg-white p-6"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-gray-600">{detail}</p>{retry ? <Button className="mt-4" variant="outline" size="sm" onClick={retry}>Retry</Button> : null}</section>;
}

function OverviewSkeleton() {
  return <section className="space-y-4" aria-label="Loading overview"><div className="h-12 w-40 animate-pulse bg-stone-200" /><div className="h-44 max-w-xl animate-pulse border border-stone-200 bg-white" /></section>;
}

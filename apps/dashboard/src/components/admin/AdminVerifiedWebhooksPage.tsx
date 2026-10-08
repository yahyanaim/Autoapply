'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Button } from '@/components/ui/Button';

const today = () => new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 20;

export function AdminVerifiedWebhooksPage() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [state, setState] = useState<'all' | 'unresolved' | 'retryable' | 'resolved'>('all');
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const days = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
  const invalid = !Number.isInteger(days) || days < 1 || days > 90;
  const params = { from, to, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}),
    ...(state !== 'all' ? { state } : {}) };
  const result = useQuery({
    queryKey: ['admin-console', 'verified-webhooks', params],
    queryFn: () => adminApiClient.adminConsole.verifiedWebhooks(params),
    enabled: !invalid, retry: false,
  });
  const reset = () => { setCursor(undefined); setHistory([]); };
  const data = result.data;
  return <section className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">Admin Console</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Verified webhook issues</h1>
      <p className="mt-1 text-sm text-gray-600">Read-only, future-only processing observations. No replay controls. An absent receipt alone does not prove failure.</p>
    </header>
    <div className="flex flex-wrap items-end gap-3 border border-stone-200 bg-white p-4">
      <label className="text-sm">From UTC day<input aria-label="From UTC day" type="date" value={from} onChange={(event) => { setFrom(event.target.value); reset(); }} className="mt-1 block rounded-md border border-stone-300 px-3 py-2" /></label>
      <label className="text-sm">To UTC day<input aria-label="To UTC day" type="date" value={to} onChange={(event) => { setTo(event.target.value); reset(); }} className="mt-1 block rounded-md border border-stone-300 px-3 py-2" /></label>
      <label className="text-sm">Status<select aria-label="Webhook status" value={state} onChange={(event) => { setState(event.target.value as typeof state); reset(); }} className="mt-1 block rounded-md border border-stone-300 px-3 py-2"><option value="all">All issues</option><option value="unresolved">Unresolved</option><option value="retryable">Retryable</option><option value="resolved">Resolved</option></select></label>
    </div>
    {invalid ? <State title="Invalid UTC range" detail="Choose 1 to 90 inclusive UTC days." />
      : result.isLoading ? <State title="Loading verified webhook issues…" detail="Reading bounded, local observations." />
      : result.isError ? <State title="Could not load webhook issues" detail="No clean result can be assumed." retry={() => void result.refetch()} />
      : data ? <>
        <div className="border border-stone-200 bg-white p-4 text-sm" role="status">
          <p className="font-semibold capitalize">{data.coverage} local capture coverage</p>
          <p className="mt-1 text-gray-600">Capture starts {new Date(data.coverageStartAt).toISOString()}. Read as of {new Date(data.asOf).toISOString()}.</p>
          {data.coveredRange ? <p className="mt-1 text-gray-600">Covered: {new Date(data.coveredRange.from).toISOString()} to {new Date(data.coveredRange.toExclusive).toISOString()} (exclusive).</p> : null}
          <p className="mt-1 text-xs text-gray-500">Only relevant webhook deliveries verified by this application after activation are recorded. Unresolved may include an interrupted process; retryable is limited to classified provider unavailability. This is not a Stripe-wide delivery inventory, payout reconciliation, or bank reconciliation.</p>
        </div>
        {data.items.length === 0 ? <State title="No captured issues on this page" detail="This does not prove that Stripe sent no events or that all financial evidence is complete." />
          : <div className="overflow-x-auto border border-stone-200 bg-white"><table aria-label="Verified webhook issues" className="min-w-[700px] w-full text-left text-sm"><thead className="border-b bg-stone-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Observed UTC</th><th className="px-4 py-3">Event class</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Safe reason</th><th className="px-4 py-3">Local reference</th></tr></thead><tbody className="divide-y divide-stone-100">{data.items.map((row) => <tr key={row.id}><td className="px-4 py-3">{new Date(row.observedAt).toISOString()}</td><td className="px-4 py-3">{row.eventType}</td><td className="px-4 py-3 capitalize">{row.status}</td><td className="px-4 py-3">{row.reason.replaceAll('_', ' ')}</td><td className="px-4 py-3 font-mono text-xs">{row.id}</td></tr>)}</tbody></table></div>}
        <div className="flex gap-2"><Button variant="outline" disabled={history.length === 0} onClick={() => { setCursor(history[history.length - 1]); setHistory((items) => items.slice(0, -1)); }}>Previous</Button><Button variant="outline" disabled={!data.nextCursor} onClick={() => { if (!data.nextCursor) return; setHistory((items) => [...items, cursor]); setCursor(data.nextCursor ?? undefined); }}>Next</Button></div>
      </> : null}
  </section>;
}

function State({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return <div className="border border-stone-200 bg-white p-5"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-gray-600">{detail}</p>{retry ? <Button className="mt-3" variant="outline" onClick={retry}>Retry</Button> : null}</div>;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [selectedId, setSelectedId] = useState<string>();
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [lastRequestedId, setLastRequestedId] = useState<string>();
  const queryClient = useQueryClient();
  const days = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
  const invalid = !Number.isInteger(days) || days < 1 || days > 90;
  const params = { from, to, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}),
    ...(state !== 'all' ? { state } : {}) };
  const result = useQuery({
    queryKey: ['admin-console', 'verified-webhooks', params],
    queryFn: () => adminApiClient.adminConsole.verifiedWebhooks(params),
    enabled: !invalid, retry: false,
  });
  const data = result.data;
  const selectedRow = data?.items.find((item) => item.id === selectedId && item.retryEligible);
  const currentSelection = useRef<{ id: string; eventType: string; observedAt: string } | null>(null);
  currentSelection.current = selectedRow && result.isSuccess && !result.isFetching
    ? { id: selectedRow.id, eventType: selectedRow.eventType, observedAt: selectedRow.observedAt }
    : null;
  useEffect(() => {
    if (selectedId && result.isSuccess && !selectedRow) {
      setSelectedId(undefined);
      setCode('');
      setConfirmed(false);
      setIdempotencyKey('');
    }
  }, [result.isSuccess, selectedId, selectedRow]);
  const retry = useMutation({
    mutationFn: async (deliveryId: string) => {
      const selection = currentSelection.current;
      if (selection?.id !== deliveryId ||
        !confirmed || !idempotencyKey || code.length !== 6) {
        throw new Error('Retry confirmation is incomplete');
      }
      const issued = await adminApiClient.adminConsole.issueStepUp({
        code, action: 'admin.webhook.retry', targetType: 'webhook_delivery', targetId: deliveryId,
      });
      if (currentSelection.current?.id !== selection.id ||
        currentSelection.current.eventType !== selection.eventType ||
        currentSelection.current.observedAt !== selection.observedAt) {
        throw new Error('Retry selection is no longer current');
      }
      return adminApiClient.adminConsole.retryVerifiedWebhook(deliveryId, {
        stepUpProof: issued.proof, idempotencyKey,
      });
    },
    onSuccess: async (response) => {
      setLastRequestedId(response.deliveryId);
      setSelectedId(undefined);
      setCode('');
      setConfirmed(false);
      setIdempotencyKey('');
      await queryClient.invalidateQueries({ queryKey: ['admin-console', 'verified-webhooks'] });
    },
  });
  const clearSelection = () => { setSelectedId(undefined); setCode('');
    setConfirmed(false); setIdempotencyKey(''); };
  const reset = () => { setCursor(undefined); setHistory([]); clearSelection(); };
  return <section className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">Admin Console</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Verified webhook issues</h1>
      <p className="mt-1 text-sm text-gray-600">Future-only processing observations with a guarded retry for narrowly eligible failures. An absent receipt alone does not prove failure.</p>
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
          <p className="mt-1 text-xs text-gray-500">Only relevant webhook deliveries verified by this application after activation are recorded. Unresolved may include an interrupted process. Retry eligibility additionally requires a recent signed Stripe event time, a pending Billing evidence case, no receipt, available attempts, and no active lease; Stripe retrieval can still fail. Older records without event-time evidence remain inspection-only. This is not a Stripe-wide delivery inventory, payout reconciliation, or bank reconciliation.</p>
        </div>
        {lastRequestedId ? <p role="status" className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Retry requested for local reference {lastRequestedId}. Billing will process it through the existing evidence worker; refresh to inspect the outcome.</p> : null}
        {data.items.length === 0 ? <State title="No captured issues on this page" detail="This does not prove that Stripe sent no events or that all financial evidence is complete." />
          : <div className="overflow-x-auto border border-stone-200 bg-white"><table aria-label="Verified webhook issues" className="min-w-[800px] w-full text-left text-sm"><thead className="border-b bg-stone-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Observed UTC</th><th className="px-4 py-3">Event class</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Safe reason</th><th className="px-4 py-3">Local reference</th><th className="px-4 py-3">Retry</th></tr></thead><tbody className="divide-y divide-stone-100">{data.items.map((row) => <tr key={row.id}><td className="px-4 py-3">{new Date(row.observedAt).toISOString()}</td><td className="px-4 py-3">{row.eventType}</td><td className="px-4 py-3 capitalize">{row.status}</td><td className="px-4 py-3">{row.reason.replaceAll('_', ' ')}</td><td className="px-4 py-3 font-mono text-xs">{row.id}</td><td className="px-4 py-3">{row.retryEligible ? <Button variant="outline" size="sm" onClick={() => { setSelectedId(row.id); setCode(''); setConfirmed(false); setIdempotencyKey(crypto.randomUUID()); retry.reset(); }}>Request retry</Button> : <span className="text-xs text-gray-500">{row.retryStatus === 'none' ? 'Inspection only' : row.retryStatus.replaceAll('_', ' ')}</span>}</td></tr>)}</tbody></table></div>}
        {selectedRow ? <form className="space-y-3 border border-orange-200 bg-orange-50 p-4" onSubmit={(event) => { event.preventDefault(); if (confirmed && code.length === 6 && !result.isFetching) retry.mutate(selectedRow.id); }}>
          <p className="font-medium">Confirm Billing retry</p>
          <p className="text-sm text-gray-700">Local reference: {selectedRow.id}. Event class: {selectedRow.eventType}. Observed UTC: {selectedRow.observedAt}. This schedules one existing Billing evidence-worker attempt; it does not guarantee provider retrieval or a monetary effect.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this eligible local retry request.</label>
          <label className="block text-sm">Authenticator code<input aria-label="Webhook retry authenticator code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 block rounded-md border border-stone-300 px-3 py-2" /></label>
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={!confirmed || code.length !== 6 || result.isFetching || retry.isPending}>{retry.isPending ? 'Requesting…' : 'Confirm retry'}</Button><Button type="button" variant="outline" size="sm" onClick={clearSelection}>Cancel</Button></div>
          {retry.isError ? <p role="alert" className="text-sm text-red-700">Retry could not be requested. Confirm current eligibility and the fresh authenticator code, then try again.</p> : null}
        </form> : null}
        <div className="flex gap-2"><Button variant="outline" disabled={history.length === 0} onClick={() => { clearSelection(); setCursor(history[history.length - 1]); setHistory((items) => items.slice(0, -1)); }}>Previous</Button><Button variant="outline" disabled={!data.nextCursor} onClick={() => { if (!data.nextCursor) return; clearSelection(); setHistory((items) => [...items, cursor]); setCursor(data.nextCursor ?? undefined); }}>Next</Button></div>
      </> : null}
  </section>;
}

function State({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return <div className="border border-stone-200 bg-white p-5"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-gray-600">{detail}</p>{retry ? <Button className="mt-3" variant="outline" onClick={retry}>Retry</Button> : null}</div>;
}

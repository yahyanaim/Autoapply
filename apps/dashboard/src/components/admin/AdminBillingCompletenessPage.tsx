'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Button } from '@/components/ui/Button';

const today = () => new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 20;

export function AdminBillingCompletenessPage() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [scanId, setScanId] = useState<string>();
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const [scanVersion, setScanVersion] = useState(0);
  const days = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
  const invalid = !Number.isInteger(days) || days < 1 || days > 7;
  const params = useMemo(() => ({ from, to, limit: PAGE_SIZE, ...(scanId ? { scanId } : {}),
    ...(cursor ? { cursor } : {}) }), [from, to, scanId, cursor]);
  const result = useQuery({
    queryKey: ['admin-console', 'billing-completeness', params, scanVersion],
    queryFn: () => adminApiClient.adminConsole.billingCompleteness(params),
    enabled: !invalid,
    retry: false,
  });
  const changeRange = (change: () => void) => {
    change(); setScanId(undefined); setCursor(undefined); setHistory([]);
  };
  const next = () => {
    const response = result.data;
    if (!response?.nextCursor) return;
    setHistory((previous) => [...previous, cursor]);
    setScanId(response.scanId);
    setCursor(response.nextCursor);
  };
  const previous = () => {
    if (history.length === 0) return;
    setCursor(history[history.length - 1]);
    setHistory((items) => items.slice(0, -1));
  };
  const data = result.data;
  const findingLabel = (value: string) => value.replaceAll('_', ' ');

  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">Admin Console</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Financial event checks</h1>
        <p className="mt-1 text-sm text-gray-600">Read-only comparison of supported Stripe events with Billing receipts and effects. Not payout or bank reconciliation.</p>
      </div>
      <Link href="/admin/console/metrics" className="text-sm font-semibold text-orange-700 hover:text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-400">Back to metrics</Link>
    </header>
    <div className="flex flex-wrap items-end gap-3 border border-stone-200 bg-white p-4">
      <label className="text-sm">From UTC day<input aria-label="Scan from UTC day" type="date" value={from} onChange={(event) => changeRange(() => setFrom(event.target.value))} className="mt-1 block rounded-md border border-stone-300 px-3 py-2" /></label>
      <label className="text-sm">To UTC day<input aria-label="Scan to UTC day" type="date" value={to} onChange={(event) => changeRange(() => setTo(event.target.value))} className="mt-1 block rounded-md border border-stone-300 px-3 py-2" /></label>
      <Button variant="outline" onClick={() => { setScanId(undefined); setCursor(undefined); setHistory([]); setScanVersion((version) => version + 1); }}>New scan</Button>
    </div>
    {invalid ? <State title="Invalid UTC range" detail="Choose 1 to 7 inclusive UTC days." />
      : result.isLoading ? <State title="Scanning supported events…" detail="The provider comparison is bounded and may take a moment." />
      : result.isError ? <State title="Could not load financial checks" detail="No clean result can be assumed." retry={() => void result.refetch()} />
      : data ? <>
        <div className="border border-stone-200 bg-white p-4 text-sm" role="status">
          <p className="font-semibold capitalize">{data.status} scan</p>
          <p className="mt-1 text-gray-600">Stripe event cutoff {new Date(data.asOf).toISOString()} · {data.scannedEventCount} supported events examined.</p>
          {data.attemptedRange ? <p className="mt-1 text-gray-600">Attempted: {new Date(data.attemptedRange.from).toISOString()} to {new Date(data.attemptedRange.toExclusive).toISOString()} (exclusive).</p> : null}
          {data.verifiedCoveredRange ? <p className="mt-1 text-gray-600">Verified comparison: {new Date(data.verifiedCoveredRange.from).toISOString()} to {new Date(data.verifiedCoveredRange.toExclusive).toISOString()} (exclusive).</p> : null}
          {data.status !== 'completed' ? <p className="mt-1 text-amber-800">Comparison is not complete ({findingLabel(data.reason ?? 'unknown')}). No-discrepancy claim is unavailable.</p> : null}
          <p className="mt-1 text-xs text-gray-500">Only available provider events and future-only ledger history are compared. Local data is read from a separate snapshot for each provider page, not one atomic Stripe/PostgreSQL snapshot. A later delivery can change a later scan.</p>
        </div>
        {data.status === 'completed' && data.findings.length === 0 && !cursor
          ? <State title="No discrepancies in this completed scan" detail="This is not proof of all Stripe activity or bank settlement." />
          : data.findings.length === 0 ? <State title="No findings on this page" detail="Incomplete and unavailable scans are never treated as clean." />
            : <div className="overflow-x-auto border border-stone-200 bg-white">
              <table aria-label="Financial event discrepancies" className="min-w-[650px] w-full text-left text-sm">
                <thead className="border-b bg-stone-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">UTC event time</th><th className="px-4 py-3">Supported event class</th><th className="px-4 py-3">Finding</th><th className="px-4 py-3">Local reference</th></tr></thead>
                <tbody className="divide-y divide-stone-100">{data.findings.map((row) => <tr key={row.id}><td className="px-4 py-3">{new Date(row.eventAt).toISOString()}</td><td className="px-4 py-3">{row.eventType}</td><td className="px-4 py-3 capitalize">{findingLabel(row.finding)}</td><td className="px-4 py-3 font-mono text-xs">{row.id}</td></tr>)}</tbody>
              </table>
            </div>}
        <div className="flex gap-2"><Button variant="outline" disabled={history.length === 0} onClick={previous}>Previous</Button><Button variant="outline" disabled={!data.nextCursor} onClick={next}>Next</Button></div>
      </> : null}
  </section>;
}

function State({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return <div className="border border-stone-200 bg-white p-5"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-gray-600">{detail}</p>{retry ? <Button className="mt-3" variant="outline" onClick={retry}>Retry</Button> : null}</div>;
}

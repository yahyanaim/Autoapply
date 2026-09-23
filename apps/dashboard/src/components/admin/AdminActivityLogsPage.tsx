'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminConsoleActivityLogsRequest } from '@applyai/shared-types';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Button } from '@/components/ui/Button';

const PAGE_SIZE = 20;

function toIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function actionLabel(action: string | null) {
  return action ? action.replaceAll('.', ' · ').replaceAll('_', ' ') : 'System event';
}

function targetLabel(targetType: string | null, targetId: string | null) {
  if (!targetType) return '—';
  return targetId ? `${targetType} · ${targetId}` : targetType;
}

export function AdminActivityLogsPage() {
  const [action, setAction] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);

  const dateRangeInvalid = Boolean(createdFrom && createdTo && createdFrom > createdTo);
  const query = useMemo<AdminConsoleActivityLogsRequest>(() => ({
    limit: PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
    ...(action.trim() ? { action: action.trim() } : {}),
    ...(actorUserId.trim() ? { actorUserId: actorUserId.trim() } : {}),
    ...(targetType.trim() ? { targetType: targetType.trim() } : {}),
    ...(targetId.trim() ? { targetId: targetId.trim() } : {}),
    ...(createdFrom ? { createdFrom: toIso(createdFrom) } : {}),
    ...(createdTo ? { createdTo: toIso(createdTo) } : {}),
  }), [action, actorUserId, createdFrom, createdTo, cursor, targetId, targetType]);

  const logs = useQuery({
    queryKey: ['admin-console', 'activity-logs', query],
    queryFn: () => adminApiClient.adminConsole.activityLogs(query),
    enabled: !dateRangeInvalid,
  });

  useEffect(() => {
    setCursor(undefined);
    setHistory([]);
  }, [action, actorUserId, targetType, targetId, createdFrom, createdTo]);

  const clearFilters = () => {
    setAction('');
    setActorUserId('');
    setTargetType('');
    setTargetId('');
    setCreatedFrom('');
    setCreatedTo('');
  };

  if (dateRangeInvalid) {
    return <PageState title="Invalid date range" detail="The start date must be before the end date." retry={clearFilters} actionLabel="Clear filters" />;
  }

  if (logs.isLoading) return <ActivityLogsSkeleton />;
  if (logs.isError) {
    return <PageState title="Could not load activity logs" detail="The request did not return a safe audit page." retry={() => void logs.refetch()} />;
  }

  const data = logs.data;
  if (!data) return null;
  const nextCursor =
    typeof data.nextCursor === 'string' && data.nextCursor.trim().length > 0
      ? data.nextCursor
      : undefined;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">Admin Console</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Activity Log</h1>
          <p className="mt-1 text-sm text-gray-600">Redacted administrative events only.</p>
        </div>
        <Link href="/admin/console/users" className="text-sm font-semibold text-orange-700 hover:text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-400">
          Back to users
        </Link>
      </div>

      <div className="grid gap-3 border border-stone-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-3">
        <FilterInput label="Action" value={action} onChange={setAction} placeholder="admin.user.suspend" />
        <FilterInput label="Actor user ID" value={actorUserId} onChange={setActorUserId} placeholder="Actor ID" />
        <FilterInput label="Target type" value={targetType} onChange={setTargetType} placeholder="user" />
        <FilterInput label="Target ID" value={targetId} onChange={setTargetId} placeholder="Target ID" />
        <DateFilter label="Created from" value={createdFrom} onChange={setCreatedFrom} />
        <DateFilter label="Created to" value={createdTo} onChange={setCreatedTo} />
        <div className="flex items-end">
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
        </div>
      </div>

      {data.events.length === 0 ? (
        <PageState title="No activity events found" detail="Try broadening the approved filters." />
      ) : (
        <div className="overflow-x-auto border border-stone-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Correlation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.events.map((event) => (
                <tr key={event.id} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-gray-950">{actionLabel(event.action)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{event.actorRef ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{targetLabel(event.targetType, event.targetId)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{event.correlationId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" disabled={history.length === 0} onClick={() => {
          const previous = history.at(-1);
          setHistory((items) => items.slice(0, -1));
          setCursor(previous);
        }}>Previous</Button>
        <p className="text-xs text-gray-500">Cursor pagination</p>
        {nextCursor ? (
          <Button type="button" variant="outline" size="sm" onClick={() => {
            setHistory((items) => [...items, cursor]);
            setCursor(nextCursor);
          }}>Next</Button>
        ) : null}
      </div>
    </section>
  );
}

function FilterInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="grid gap-1.5 text-xs font-medium text-gray-700">{label}<input aria-label={`Filter by ${label}`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label>;
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1.5 text-xs font-medium text-gray-700">{label}<input aria-label={label} type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label>;
}

function PageState({ title, detail, retry, actionLabel = 'Retry' }: { title: string; detail: string; retry?: () => void; actionLabel?: string }) {
  return <div className="border border-stone-200 bg-white p-6"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-gray-600">{detail}</p>{retry ? <Button className="mt-4" variant="outline" size="sm" onClick={retry}>{actionLabel}</Button> : null}</div>;
}

function ActivityLogsSkeleton() {
  return <div className="space-y-4" aria-label="Loading activity logs"><div className="h-12 w-48 animate-pulse bg-stone-200" /><div className="h-40 animate-pulse border border-stone-200 bg-white" /><div className="h-80 animate-pulse border border-stone-200 bg-white" /></div>;
}

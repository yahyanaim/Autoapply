'use client';

import { useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Bell, ChartNoAxesColumn, CircleAlert, CircleCheck, CirclePause, DoorOpen, Files, Gauge, UsersRound, type LucideIcon } from 'lucide-react';
import type { AdminConsoleApplicationsRequest, AdminConsoleNotificationsRequest } from '@applyai/shared-types';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OverviewSkeleton } from './AdminOverviewPresentation';
import { useAdminLocale } from './AdminLocale';
import { adminReadOperationsCopy } from './AdminReadOperationsCopy';
import type { CountRow, CountTone } from './AdminReadOperationsChart';

const CountBarPlot = dynamic(() => import('./AdminReadOperationsChart'), {
  ssr: false,
  loading: () => <OverviewSkeleton className="h-full w-full" />,
});

const PAGE_SIZE = 20;
const fieldClass = 'mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-border bg-white px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';
const readButtonClass = 'min-h-11 rounded-xl border-border bg-white px-4 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-muted-foreground/40 hover:bg-muted/50 hover:text-foreground active:translate-y-px focus-visible:ring-2 focus-visible:ring-primary-700';
// One-pixel gutters form real, continuous separators in both RTL and LTR.
const statisticsClass = 'grid gap-px bg-border/60 [&>div]:bg-white';
const iconTone = {
  brand: 'border-primary-100 bg-primary-50 text-primary-700',
  success: 'border-success-200 bg-success-50 text-success-800',
  danger: 'border-danger-200 bg-danger-50 text-danger-800',
  neutral: 'border-border/70 bg-muted/30 text-muted-foreground',
  warning: 'border-warning-200 bg-warning-50 text-warning-800',
};
function CardIcon({ icon: Icon, tone = 'brand' }: { icon: LucideIcon; tone?: keyof typeof iconTone }) {
  return <span data-slot="card-icon" aria-hidden="true" className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconTone[tone]}`}><Icon className="h-4 w-4" strokeWidth={1.75} /></span>;
}
function GateState({ state, label }: { state: 'open' | 'full' | 'disabled'; label: string }) {
  const Icon = state === 'open' ? CircleCheck : state === 'full' ? CircleAlert : CirclePause;
  const tone = state === 'open' ? 'success' : state === 'full' ? 'warning' : 'neutral';
  return <span data-slot="gate-status" className={`inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium ${iconTone[tone]}`}><Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /><span className="break-words">{label}</span></span>;
}
function notificationTone(key: string): CountTone {
  return key === 'failed' ? 'danger' : key === 'sent' || key === 'read' ? 'success' : 'neutral';
}
function applicationTone(key: string): CountTone {
  return key === 'rejected' ? 'danger' : key === 'interview' || key === 'offer' ? 'success' : key === 'submitted' ? 'brand' : 'neutral';
}
function Stamp({ value }: { value: string }) {
  return <bdi dir="ltr" className="inline-block break-all font-mono text-xs tabular-nums">{value}</bdi>;
}
function Frame({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  const { locale } = useAdminLocale();
  const copy = adminReadOperationsCopy[locale];
  return <section lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className="mx-auto max-w-[1220px] space-y-6 rounded-3xl border border-border/50 bg-white px-4 py-6 text-foreground sm:px-6 sm:py-8 lg:px-8">
    <header className="pb-1"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] font-medium text-muted-foreground">{copy.operations}</p><p className="rounded-md border border-border bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground">{copy.readOnly}</p></div><div className="mt-4"><h1 className="text-[26px] font-semibold leading-snug sm:text-[32px]">{title}</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted-foreground sm:text-sm">{detail}</p></div></header>
    {children}
  </section>;
}
function Source<T>({ query, title, children }: { query: UseQueryResult<T>; title: string; children: (data: T) => ReactNode }) {
  const { locale } = useAdminLocale();
  const copy = adminReadOperationsCopy[locale];
  if (query.isLoading) return <div role="status" aria-label={`${copy.loading} ${title}`} className="space-y-4 rounded-2xl border border-border/70 p-6"><p className="text-xs">{copy.loading} {title}…</p><OverviewSkeleton className="h-8 w-1/3" /><OverviewSkeleton className="h-20 w-full" /></div>;
  if (query.isError) {
    const status = (query.error as { response?: { status?: number } })?.response?.status;
    const denied = status === 401 || status === 403;
    return <div role="alert" className="space-y-3 rounded-2xl border border-danger-200 bg-danger-50 p-5 text-xs text-danger-800"><p className="font-semibold">{denied ? copy.inaccessible : `${copy.error} ${title}`}</p><p className="leading-6">{denied ? copy.inaccessibleDetail : copy.errorDetail}</p><Button type="button" variant="outline" className={readButtonClass} onClick={() => void query.refetch()} disabled={query.isFetching}>{copy.retry}</Button></div>;
  }
  if (!query.data) return <p role="status" className="rounded-2xl border border-border p-5 text-xs">{copy.unavailable}</p>;
  return <>{query.isFetching ? <p role="status" className="text-xs text-primary-800">{copy.refreshing}</p> : null}{children(query.data)}</>;
}
function Period({ from, to }: { from: string; to: string }) {
  const { locale } = useAdminLocale(); const copy = adminReadOperationsCopy[locale];
  return <div data-slot="returned-period" className="min-w-0 border-t border-border/70 bg-muted/15 px-5 py-4 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2"><p className="text-xs font-medium leading-5">{copy.observed}</p><div className="flex flex-wrap gap-x-6 gap-y-2"><p className="min-w-0 text-xs"><span className="me-2 text-muted-foreground">{copy.from}</span><Stamp value={from} /></p><p className="min-w-0 text-xs"><span className="me-2 text-muted-foreground">{copy.to}</span><Stamp value={to} /></p></div></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.periodHelp}</p></div>;
}
function Summary({ children }: { children: ReactNode }) {
  return <div data-slot="operations-summary" className="min-w-0 overflow-hidden rounded-[20px] border border-border bg-white shadow-sm ring-4 ring-muted/50">{children}</div>;
}
function Value({ label, value, primary = false, compact = false, tone, icon: Icon }: { label: string; value: ReactNode; primary?: boolean; compact?: boolean; tone?: CountTone; icon?: LucideIcon }) {
  const color = tone === 'success' ? 'text-success-800' : tone === 'danger' ? 'text-danger-800' : 'text-foreground';
  return <div data-slot={primary ? 'primary-value' : 'supporting-value'} className={primary ? 'min-w-0' : compact ? 'min-w-0 px-4 py-4' : 'min-w-0 px-5 py-4'}><dt className="flex items-start gap-1.5 text-xs font-medium leading-5 text-muted-foreground">{Icon ? <Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> : null}<span>{label}</span></dt><dd className={`${primary ? 'mt-3 break-words text-[48px] font-medium leading-none text-foreground tabular-nums sm:text-[56px]' : compact ? 'mt-2 break-words text-[28px] font-medium leading-none tabular-nums sm:text-[32px]' : 'mt-2 break-words text-2xl font-semibold leading-snug tabular-nums'} ${primary ? '' : color}`}><bdi>{value}</bdi></dd></div>;
}

function PrimaryValue({ label, value, help, icon }: { label: string; value: ReactNode; help: string; icon: LucideIcon }) {
  return <div className="min-w-0 bg-white px-5 py-5 sm:px-6 sm:py-6"><div className="flex items-start justify-between gap-3"><dl className="min-w-0"><Value label={label} value={value} primary /></dl><CardIcon icon={icon} /></div><p className="mt-3 max-w-[30ch] text-xs leading-5 text-muted-foreground">{help}</p></div>;
}

/** Local presentation only: do not change the shared Overview or sidebar cards. */
function ReadPanel({ title, icon, tone = 'neutral', children }: { title: string; icon: LucideIcon; tone?: keyof typeof iconTone; children: ReactNode }) {
  return <Card role="article" aria-label={title} data-slot="read-panel" className="min-w-0 overflow-hidden rounded-[20px] border-border bg-white p-0 shadow-sm ring-4 ring-muted/50"><header className="flex items-center justify-between gap-3 border-b border-border/60 bg-white px-5 py-4 sm:px-6"><h2 className="text-sm font-semibold leading-6 text-foreground">{title}</h2><CardIcon icon={icon} tone={tone} /></header><div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">{children}</div></Card>;
}

function Explanation({ children }: { children: ReactNode }) {
  return <p data-slot="read-explanation" className="max-w-[65ch] text-[13px] leading-6 text-muted-foreground">{children}</p>;
}

function CapacityMeter({ registrations, capacity }: { registrations: number; capacity: number }) {
  const { locale } = useAdminLocale(); const copy = adminReadOperationsCopy[locale];
  // A zero or exceeded configured capacity has no truthful bounded ratio.
  // Keep the owner's raw counts visible instead of clamping or inventing capacity.
  if (!Number.isSafeInteger(capacity) || capacity <= 0 || !Number.isSafeInteger(registrations) || registrations < 0 || registrations > capacity) return null;
  return <div className="px-4 pb-5 pt-4 sm:px-5">
    <div role="meter" aria-label={`${copy.registrations} / ${copy.capacity}`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={registrations} aria-valuetext={`${copy.registrations}: ${registrations}; ${copy.capacity}: ${capacity}`} data-slot="capacity-meter" className="h-6 overflow-hidden rounded-sm bg-muted">
      <div aria-hidden="true" className="h-full border-y border-primary-700 bg-primary-500" style={{ width: `${registrations / capacity * 100}%`, maskImage: 'repeating-linear-gradient(to right, #000 0, #000 3px, transparent 3px, transparent 6px)' }} />
    </div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.betaMeterHelp}</p>
  </div>;
}

function CountChart({ label, rows, period }: { label: string; rows: CountRow[]; period: { from: string; to: string } }) {
  const { locale } = useAdminLocale(); const copy = adminReadOperationsCopy[locale];
  const rtl = locale === 'ar';
  const drawable = rows.length > 0 && rows.every(row => Number.isSafeInteger(row.count) && row.count >= 0) && rows.some(row => row.count > 0);
  const maximum = drawable ? Math.max(...rows.map(row => row.count)) : 0;
  return <figure data-slot="count-distribution" aria-label={`${label} · ${period.from} → ${period.to} · UTC`} className="min-w-0 space-y-3">
    <dl data-slot="distribution-counts" className={drawable ? 'sr-only' : 'grid grid-cols-2 divide-x divide-border/60 sm:grid-cols-3'}>{rows.map(row => <Value key={row.key} label={row.label} value={row.count} tone={row.tone} compact />)}</dl>
    {drawable ? <div>
      <div style={{ height: rows.length * 36 + 36 }} className="[&>div]:h-full"><CountBarPlot label={label} rows={rows} maximum={maximum} rtl={rtl} unit={copy.count} /></div>
      <p className="mt-1 text-end text-[11px] text-muted-foreground">{copy.count}</p>
    </div> : null}
    {drawable ? <figcaption className="border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground">{copy.chartHelp}</figcaption> : null}
  </figure>;
}

/** One total and one exact distribution, rather than repeating every count in tiles. */
function DistributionSummary({ totalLabel, total, help, interpretation, title, label, rows, period, empty, icon }: {
  totalLabel: string; total: number; help: string; interpretation: string; title: string;
  label: string; rows: CountRow[]; period: { from: string; to: string }; empty?: string; icon: LucideIcon;
}) {
  return <Summary>
    <div data-slot="distribution-summary" className="grid min-w-0 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,2fr)]">
      <div className="min-w-0 border-b border-border/60 lg:border-b-0 lg:border-e">
        <PrimaryValue label={totalLabel} value={total} help={help} icon={icon} />
        <div className="px-5 pb-5 sm:px-6"><Explanation>{interpretation}</Explanation></div>
      </div>
      <div className="min-w-0 px-4 py-5 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold leading-6">{title}</h2><CardIcon icon={ChartNoAxesColumn} tone="neutral" /></div>
        {empty ? <p role="status" className="mb-3 rounded-xl bg-muted/30 p-3 text-xs leading-5">{empty}</p> : null}
        <CountChart label={label} rows={rows} period={period} />
      </div>
    </div>
    <Period from={period.from} to={period.to} />
  </Summary>;
}

export function AdminBetaGatePage() {
  const { locale } = useAdminLocale(); const copy = adminReadOperationsCopy[locale];
  const query = useQuery({ queryKey: ['admin-console', 'beta-gate'], queryFn: () => adminApiClient.adminConsole.betaGate() });
  return <Frame title={copy.beta} detail={copy.betaDetail}><Source query={query} title={copy.beta}>{(gate) => <>
    <Summary>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <PrimaryValue label={copy.registrations} value={gate.registrationCount} help={copy.betaTotalHelp} icon={UsersRound} />
        <div className="min-w-0 border-t border-border/60 lg:border-s lg:border-t-0">
          <dl data-slot="statistics-grid" className={`${statisticsClass} grid-cols-3 [&_dt]:min-h-10 sm:[&_dt]:min-h-5`}>
            <Value label={copy.capacity} value={gate.capacity} icon={Gauge} compact />
            <Value label={copy.remaining} value={gate.remainingSlots} icon={DoorOpen} tone={gate.status === 'open' && gate.remainingSlots > 0 ? 'success' : 'neutral'} compact />
            <Value label={copy.status} value={<GateState state={gate.status} label={copy[gate.status]} />} compact />
          </dl>
          <div className="border-t border-border/60"><CapacityMeter registrations={gate.registrationCount} capacity={gate.capacity} /></div>
        </div>
      </div>
      <div data-slot="gate-context" className="grid gap-4 border-t border-border/70 bg-muted/15 px-5 py-4 sm:px-6 lg:grid-cols-2">
        <Explanation>{copy.betaExplanation}</Explanation>
        <div className="min-w-0 space-y-2"><p className="text-xs font-medium leading-5">{copy.updated}: <Stamp value={gate.updatedAt} /></p><Explanation>{copy.betaRecordHelp}</Explanation></div>
        {!gate.enabled ? <p role="status" className="rounded-xl bg-muted p-3 text-xs leading-5 lg:col-span-2">{copy.betaDisabled}</p> : null}
      </div>
    </Summary>
  </>}</Source></Frame>;
}

export function AdminNotificationsPage() {
  const { locale } = useAdminLocale(); const copy = adminReadOperationsCopy[locale];
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const params = useMemo<AdminConsoleNotificationsRequest>(() => ({ limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }), [cursor]);
  const query = useQuery({ queryKey: ['admin-console', 'notifications', params], queryFn: () => adminApiClient.adminConsole.notifications(params) });
  return <Frame title={copy.notifications} detail={copy.notificationDetail}><Source query={query} title={copy.notifications}>{(data) => <>
    <DistributionSummary icon={Bell} totalLabel={copy.total} total={data.rollup.total} help={copy.notificationTotalHelp} interpretation={copy.notificationExplanation} title={copy.notificationDistribution} label={copy.notificationDetail} period={data.period} rows={(['pending', 'sent', 'failed', 'read'] as const).map(key => ({ key, label: copy[key], count: data.rollup[key], tone: notificationTone(key) }))} />
    <ReadPanel title={copy.failures} icon={CircleAlert} tone={data.failures.length ? 'danger' : 'neutral'}>
      <Explanation>{copy.failuresDetail}</Explanation>
      {data.failures.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-border/70"><table className="w-full text-start text-xs"><caption className="sr-only">{copy.failures}</caption><thead className="bg-muted/30"><tr>{[copy.reference, copy.channel, copy.created].map((title) => <th key={title} scope="col" className="px-3 py-3 text-start font-medium">{title}</th>)}</tr></thead><tbody>{data.failures.map((failure) => <tr key={failure.id} className="border-t border-border/60"><td className="break-all px-3 py-4"><bdi dir="ltr">{failure.id}</bdi></td><td className="px-3 py-4"><bdi dir="ltr">{failure.channel}</bdi></td><td className="px-3 py-4"><Stamp value={failure.createdAt} /></td></tr>)}</tbody></table></div> : <div role="status" className="mt-4 rounded-xl bg-muted/30 p-4 text-xs leading-6"><p className="font-medium">{copy.noFailures}</p><p>{copy.noFailuresDetail}</p></div>}
      <nav aria-label={copy.pagination} className="mt-5 flex flex-wrap justify-between gap-3 border-t border-border/60 pt-4"><Button type="button" variant="outline" className={readButtonClass} disabled={!history.length} onClick={() => { setCursor(history[history.length - 1]); setHistory((items) => items.slice(0, -1)); }}>{copy.previous}</Button>{data.nextCursor?.trim() ? <Button type="button" variant="outline" className={readButtonClass} onClick={() => { setHistory((items) => [...items, cursor]); setCursor(data.nextCursor ?? undefined); }}>{copy.next}</Button> : null}</nav>
    </ReadPanel>
  </>}</Source></Frame>;
}

export function AdminApplicationsPage() {
  const { locale } = useAdminLocale(); const copy = adminReadOperationsCopy[locale];
  const [createdFrom, setCreatedFrom] = useState(''); const [createdTo, setCreatedTo] = useState('');
  const invalid = Boolean(createdFrom && createdTo && createdFrom > createdTo);
  const params = useMemo<AdminConsoleApplicationsRequest>(() => ({ ...(createdFrom ? { createdFrom: new Date(createdFrom).toISOString() } : {}), ...(createdTo ? { createdTo: new Date(createdTo).toISOString() } : {}) }), [createdFrom, createdTo]);
  const query = useQuery({ queryKey: ['admin-console', 'applications', params], queryFn: () => adminApiClient.adminConsole.applications(params), enabled: !invalid });
  return <Frame title={copy.applications} detail={copy.applicationsDetail}>
    <div data-slot="application-filters" className="grid items-end gap-3 border-y border-border/60 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <label className="min-w-0 text-xs font-medium">{copy.createdFrom}<input aria-label={copy.createdFrom} type="datetime-local" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} className={fieldClass} /></label>
      <label className="min-w-0 text-xs font-medium">{copy.createdTo}<input aria-label={copy.createdTo} type="datetime-local" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} className={fieldClass} /></label>
      <div className="min-w-0"><p className="text-xs font-medium">{copy.filters}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.localTime}</p></div>
    </div>
    {invalid ? <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-xs text-danger-800">{copy.invalid}. {copy.invalidDetail}</p> : <Source query={query} title={copy.applications}>{(data) => <>
      <DistributionSummary icon={Files} totalLabel={copy.totalApplications} total={data.total} help={copy.applicationTotalHelp} interpretation={copy.applicationExplanation} title={copy.distribution} label={copy.applicationsDetail} period={data.period} rows={Object.entries(data.byStatus).map(([status, count]) => ({ key: status, label: copy[status as 'draft'] ?? status.replaceAll('_', ' '), count, tone: applicationTone(status) }))} empty={data.total === 0 ? copy.noApplications : undefined} />
    </>}</Source>}
  </Frame>;
}

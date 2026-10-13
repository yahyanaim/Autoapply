'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Activity, Bell, ChartNoAxesCombined, ClipboardList, FileWarning, ShieldCheck, Users } from 'lucide-react';
import type { AdminConsoleApplicationsResponse, AdminConsoleRecordedFinancialAmounts, AdminConsoleRecordedFinancialDay, AdminConsoleVerifiedWebhooksResponse } from '@applyai/shared-types';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Button } from '@/components/ui/Button';
import { Badge as UiBadge } from '@/components/ui/Badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { OverviewCard as Card, OverviewChartSurface, OverviewSegmentedBar, OverviewSkeleton } from './AdminOverviewPresentation';
import { useAdminLocale, type AdminLocale } from './AdminLocale';
import { adminOverviewCopy } from './AdminOverviewCopy';

const DAY_MS = 86_400_000;
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const preciseMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });

function windowsAt(now: Date) {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const financialFrom = day(new Date(now.getTime() - 6 * DAY_MS));
  const financialTo = day(now);
  return {
    notifications: { createdFrom: new Date(now.getTime() - DAY_MS).toISOString(), createdTo: now.toISOString(), limit: 1 },
    applications: { createdFrom: new Date(now.getTime() - 30 * DAY_MS).toISOString(), createdTo: now.toISOString() },
    financial: { from: financialFrom, to: financialTo },
    webhooks: { from: financialFrom, to: financialTo, limit: 3 },
  };
}

function DateText({ value }: { value: string }) {
  return <bdi dir="ltr" className="whitespace-nowrap font-mono text-xs tabular-nums">{value}</bdi>;
}

function PeriodText({ from, to, locale }: { from: string; to: string; locale: AdminLocale }) {
  const copy = adminOverviewCopy[locale];
  return <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] leading-5 text-muted-foreground">
    <p className="flex flex-wrap items-baseline gap-x-2"><span>{copy.from}</span><DateText value={from} /></p>
    <p className="flex flex-wrap items-baseline gap-x-2"><span>{copy.to}</span><DateText value={to} /></p>
  </div>;
}

function CompactPeriod({ from, to, locale }: { from: string; to: string; locale: AdminLocale }) {
  const copy = adminOverviewCopy[locale];
  const compact = (value: string) => {
    const date = new Date(value);
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  };
  return <p className="border-t border-black/[0.06] pt-2 text-[11px] leading-4 text-gray-600" title={`${from} → ${to}`}>
    <span className="sr-only">{copy.period} {copy.from} {from} {copy.to} {to}</span>
    <bdi aria-hidden="true" dir="ltr" className="block tabular-nums">{compact(from)} → {compact(to)} UTC</bdi>
  </p>;
}

function Source<T>({ query, label, locale, children, onRetry }: { query: UseQueryResult<T>; label: string; locale: AdminLocale; children: (data: T) => ReactNode; onRetry?: () => void }) {
  const copy = adminOverviewCopy[locale];
  if (query.isLoading) return <div role="status" className="min-h-20 space-y-3 text-xs text-muted-foreground"><p>{copy.loading} {label}…</p><OverviewSkeleton className="h-5 w-2/3" /><OverviewSkeleton className="h-3 w-1/2" /></div>;
  if (query.isError) return <div role="alert" className="space-y-3 rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs leading-5 text-danger-800"><p>{copy.loadError} {label}. {copy.noAssumedValue}</p><Button type="button" variant="outline" size="sm" disabled={query.isFetching} className="min-h-11 border-danger-200 text-danger-800 hover:bg-white focus-visible:ring-2 focus-visible:ring-primary-600" onClick={onRetry ?? (() => void query.refetch())}>{copy.retry}</Button></div>;
  if (!query.data) return <p role="status" className="text-xs text-gray-600">{label}: {copy.unavailableData}</p>;
  return <>{query.isFetching ? <p role="status" className="mb-3 text-xs text-primary-700">{copy.refreshing}</p> : null}{children(query.data)}</>;
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'good' }) {
  return <UiBadge variant={tone === 'warning' ? 'warning' : tone === 'good' ? 'success' : 'secondary'} className="rounded-md px-2 py-0.5 text-[11px] font-medium leading-5">{children}</UiBadge>;
}

function allAmountsZero(totals: AdminConsoleRecordedFinancialAmounts) {
  return totals.grossRevenueMinor === 0 && totals.refundAdjustmentMinor === 0 &&
    totals.disputeWithdrawalMinor === 0 && totals.disputeReinstatementMinor === 0 &&
    totals.recordedStripeFeeMinor === 0 && totals.recordedNetRevenueMinor === 0 &&
    totals.estimatedAiCostMicroUsd === 0 && totals.estimatedContributionMarginMicroUsd === 0;
}

function ApplicationStatusChart({ data, locale }: { data: AdminConsoleApplicationsResponse; locale: AdminLocale }) {
  const copy = adminOverviewCopy[locale];
  const observed = Object.entries(data.byStatus).filter(([, count]) => count > 0);
  if (data.total === 0 || observed.length === 0) return null;
  const colors = [
    { stroke: 'stroke-primary-500', dot: 'bg-primary-500' },
    { stroke: 'stroke-primary-300', dot: 'bg-primary-300' },
    { stroke: 'stroke-primary-700', dot: 'bg-primary-700' },
    { stroke: 'stroke-primary-200', dot: 'bg-primary-200' },
    { stroke: 'stroke-gray-400', dot: 'bg-gray-400' },
    { stroke: 'stroke-gray-600', dot: 'bg-gray-600' },
  ];
  const circumference = 2 * Math.PI * 36;
  return <figure aria-label={copy.appChartLabel}>
    <figcaption className="mb-4 text-xs text-gray-600">{copy.appChartNote}</figcaption>
    <OverviewChartSurface className="flex flex-col items-center gap-4 min-[400px]:flex-row min-[400px]:justify-between">
      <div className="relative h-28 w-28 shrink-0">
        <svg aria-hidden="true" viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="36" fill="none" stroke="#f1f1ed" strokeWidth="14" />
          {observed.map(([status, count], index) => {
            const prior = observed.slice(0, index).reduce((sum, [, value]) => sum + value, 0);
            return <circle key={status} cx="50" cy="50" r="36" fill="none" strokeWidth="14" className={colors[index % colors.length].stroke} strokeDasharray={`${(count / data.total) * circumference} ${circumference}`} strokeDashoffset={-(prior / data.total) * circumference} />;
          })}
        </svg>
        <div aria-hidden="true" data-slot="application-donut-center" className="absolute inset-0 flex flex-col items-center justify-center gap-1"><bdi dir="ltr" className="text-[0.5rem] font-semibold leading-none tabular-nums">{data.total}</bdi><span className="text-[0.5rem] leading-none text-gray-600">{copy.applicationsUnit}</span></div>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {observed.map(([status, count], index) => <li key={status} className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 text-xs last:border-0">
          <span className="flex min-w-0 items-center gap-2 text-gray-700"><span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-sm ${colors[index % colors.length].dot}`} /><bdi dir="ltr">{status.replaceAll('_', ' ')}</bdi></span>
          <bdi dir="ltr" className="font-semibold tabular-nums text-[#171714]">{count}</bdi>
        </li>)}
      </ul>
    </OverviewChartSurface>
  </figure>;
}

function RecordedNetDailyChart({ daily, locale }: { daily: AdminConsoleRecordedFinancialDay[]; locale: AdminLocale }) {
  const copy = adminOverviewCopy[locale];
  const gradientId = `recorded-net-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (daily.length === 0) return <p className="text-xs text-gray-600">{copy.noDailyRows}</p>;
  const values = daily.map((row) => row.recordedNetRevenueMinor);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const axisTicks = Array.from(new Set([minimum, minimum < 0 ? Math.round(minimum / 2) : 0, 0, maximum > 0 ? Math.round(maximum / 2) : 0, maximum])).sort((a, b) => a - b);
  // Keep integer minor units all the way into the chart; conversion is display-only.
  const chartData = daily.map((row) => ({ day: row.day, coverage: row.coverage, recordedNetRevenueMinor: row.recordedNetRevenueMinor }));
  return <figure aria-label={copy.dailyChartLabel} className="border-t border-black/[0.07] pt-4">
    <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] font-semibold text-[#171714]"><span>{copy.dailyChartTitle}</span><span className="text-[11px] font-normal text-gray-600"><bdi dir="ltr">USD</bdi> {copy.usdCents}</span></figcaption>
    <OverviewChartSurface className="mt-5 border-b border-border/40 pb-3" dir="ltr">
      <ChartContainer config={{ recordedNetRevenueMinor: { label: copy.netRevenue, color: 'var(--color-primary-hover)' } }} className="h-64 w-full sm:h-80">
        <AreaChart accessibilityLayer aria-label={copy.dailyChartLabel} data={chartData} margin={{ left: 0, right: 16, top: 20, bottom: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-recordedNetRevenueMinor)" stopOpacity={0.1} /><stop offset="100%" stopColor="var(--color-recordedNetRevenueMinor)" stopOpacity={0} /></linearGradient>
            <pattern id={`${gradientId}-grid`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="hsl(var(--border))" opacity={0.4} /></pattern>
            <filter id={`${gradientId}-point`} x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#171714" floodOpacity="0.16" /></filter>
          </defs>
          <rect aria-hidden="true" width="100%" height="100%" fill={`url(#${gradientId}-grid)`} />
          <CartesianGrid vertical={false} strokeDasharray="6 8" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={12} minTickGap={28} tickFormatter={(value: string) => value.slice(5)} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} width={58} domain={[minimum, maximum]} ticks={axisTicks} tickFormatter={(value: number) => money.format(value / 100)} />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 5" />
          <ChartTooltip cursor={{ stroke: 'var(--color-recordedNetRevenueMinor)', strokeDasharray: '5 7', strokeWidth: 1, className: '!stroke-primary-600' }} content={<ChartTooltipContent
            labelFormatter={(label, payload) => <span className="flex flex-wrap items-center gap-2"><bdi dir="ltr">{String(label)} UTC</bdi><span className="text-muted-foreground">{payload[0]?.payload.coverage === 'partial' ? copy.partialDay : copy.fullDay}</span></span>}
            formatter={(value) => <><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-primary-600" /><span className="flex-1 text-muted-foreground">{copy.netRevenue}</span><bdi dir="ltr" className="font-semibold tabular-nums">{money.format(Number(value) / 100)}</bdi></>}
          />} />
          {/* Monotone smoothing changes geometry only: every marker is an original UTC daily row. */}
          <Area type="monotone" dataKey="recordedNetRevenueMinor" stroke="var(--color-recordedNetRevenueMinor)" strokeWidth={2.5} fill={`url(#${gradientId})`} baseValue={0} isAnimationActive={false}
            dot={({ cx, cy, payload }) => <circle key={payload.day} cx={cx} cy={cy} r={4.5} data-day={payload.day} data-minor={payload.recordedNetRevenueMinor} data-coverage={payload.coverage} fill={payload.coverage === 'partial' ? 'white' : 'var(--color-recordedNetRevenueMinor)'} stroke={payload.coverage === 'partial' ? 'var(--color-recordedNetRevenueMinor)' : 'white'} strokeWidth={payload.coverage === 'partial' ? 1.5 : 2} filter={`url(#${gradientId}-point)`} />}
            activeDot={({ cx, cy, payload }) => <circle cx={cx} cy={cy} r={7} data-active-coverage={payload.coverage} fill={payload.coverage === 'partial' ? 'white' : 'var(--color-recordedNetRevenueMinor)'} stroke={payload.coverage === 'partial' ? 'var(--color-recordedNetRevenueMinor)' : 'white'} strokeWidth={2.5} filter={`url(#${gradientId}-point)`} />} />
        </AreaChart>
      </ChartContainer>
    </OverviewChartSurface>
    <p className="mt-3 text-xs leading-5 text-gray-600">{copy.zeroLineNote}</p>
    <details className="mt-3 rounded-lg border border-black/[0.07] bg-white px-3 py-2 text-sm open:pb-3">
      <summary className="min-h-11 cursor-pointer py-2.5 font-medium text-primary-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">{copy.exactDaily}</summary>
      <table className="mt-3 w-full text-xs"><caption className="sr-only">{copy.dailyTableCaption}</caption><thead><tr className="border-b border-black/[0.07] text-gray-600"><th scope="col" className="py-2 text-start">{copy.dayUtc}</th><th scope="col" className="py-2 text-start">{copy.coverage}</th><th scope="col" className="py-2 text-end">USD</th></tr></thead><tbody>{daily.map((row) => <tr key={row.day} className="border-b border-black/[0.05] last:border-0"><td className="py-2"><DateText value={row.day} /></td><td className="py-2">{row.coverage === 'partial' ? copy.partialDay : copy.fullDay}</td><td className="py-2 text-end"><bdi dir="ltr" className="font-semibold tabular-nums">{money.format(row.recordedNetRevenueMinor / 100)}</bdi></td></tr>)}</tbody></table>
    </details>
  </figure>;
}

const linkClass = 'inline-flex min-h-11 items-center rounded-lg font-semibold text-primary-800 underline-offset-4 transition-colors hover:text-primary-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600';

function webhookStatus(item: AdminConsoleVerifiedWebhooksResponse['items'][number], locale: AdminLocale) {
  const copy = adminOverviewCopy[locale];
  if (item.status === 'resolved') return copy.resolved;
  if (item.retryStatus === 'pending') return copy.retryRequested;
  if (item.retryStatus === 'needs_review') return copy.retryNeedsReview;
  if (item.retryStatus === 'processed') return copy.retryProcessed;
  if (item.retryEligible) return copy.retryable;
  return item.status === 'retryable' ? copy.inspectionOnly : copy.unresolved;
}

export function AdminOverviewPage() {
  const { locale } = useAdminLocale();
  const copy = adminOverviewCopy[locale];
  // A shared request window does not imply a cross-system snapshot.
  const [windows, setWindows] = useState(() => windowsAt(new Date()));
  const readFreshness = { staleTime: 0, refetchOnMount: 'always' as const };
  const liveReadFreshness = { ...readFreshness, refetchOnWindowFocus: true };
  const overview = useQuery({ queryKey: ['admin-console', 'overview'], queryFn: () => adminApiClient.adminConsole.overview(), ...liveReadFreshness });
  const beta = useQuery({ queryKey: ['admin-console', 'beta-gate'], queryFn: () => adminApiClient.adminConsole.betaGate(), ...liveReadFreshness });
  const notifications = useQuery({ queryKey: ['admin-console', 'notifications', windows.notifications], queryFn: () => adminApiClient.adminConsole.notifications(windows.notifications), ...readFreshness });
  const applications = useQuery({ queryKey: ['admin-console', 'applications', windows.applications], queryFn: () => adminApiClient.adminConsole.applications(windows.applications), ...readFreshness });
  const metrics = useQuery({ queryKey: ['admin-console', 'metrics', windows.financial], queryFn: () => adminApiClient.adminConsole.metrics(windows.financial), ...readFreshness });
  const webhooks = useQuery({ queryKey: ['admin-console', 'verified-webhooks', windows.webhooks], queryFn: () => adminApiClient.adminConsole.verifiedWebhooks(windows.webhooks), ...readFreshness });

  const retryWindow = (source: keyof typeof windows, refetch: () => void) => {
    const next = windowsAt(new Date())[source];
    if (JSON.stringify(next) === JSON.stringify(windows[source])) {
      refetch();
      return;
    }
    // A new key has no old-window placeholder. Its labels and source result move
    // together; a late response stays in the preceding key's cache only.
    setWindows((previous) => ({ ...previous, [source]: next }));
  };

  return <section data-slot="overview-canvas" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} className="mx-auto max-w-[1220px] space-y-7 rounded-3xl border border-border/50 bg-white px-4 py-6 text-foreground sm:px-6 sm:py-8 lg:px-8 lg:py-9">
    <header className="pb-3 sm:pb-4">
      <p className="text-[11px] font-semibold text-primary-700"><bdi dir="ltr">APPLYAI / ADMIN</bdi> <span aria-hidden="true" className="mx-2 text-gray-400">/</span> {copy.operations}</p>
      <h1 className="mt-3 text-[26px] font-semibold leading-snug sm:text-[32px]">{copy.pageTitle}</h1>
      <p className="mt-2 max-w-3xl text-xs leading-6 text-gray-700 sm:text-sm">{copy.pageIntro}</p>
    </header>

    <section aria-label={copy.summaryLabel} className="space-y-3">
      <p className="text-xs text-gray-600">{copy.independentReads}</p>
      <div data-slot="overview-summary-band" className="grid overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[0_0_0_3px_rgba(23,23,20,0.025)] xl:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
      <Card compact className="border-b border-border/60 xl:border-b-0 xl:border-e" title={copy.betaTitle} subtitle={copy.betaSubtitle} icon={ShieldCheck}>
        <Source query={beta} label={copy.betaLoad} locale={locale}>{(data) => <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><strong className="block text-[40px] font-semibold leading-none tracking-tight tabular-nums sm:text-[48px]"><bdi dir="ltr">{data.registrationCount}<span className="text-xl font-medium tracking-normal text-muted-foreground"> / {data.capacity}</span></bdi></strong><Badge tone={data.status === 'open' ? 'good' : 'warning'}>{data.status === 'open' ? copy.open : data.status === 'full' ? copy.full : copy.disabled}</Badge></div>
          <div role="meter" aria-label={copy.betaTitle} aria-valuemin={0} aria-valuemax={Math.max(1, data.capacity)} aria-valuenow={Math.min(data.registrationCount, Math.max(1, data.capacity))}><OverviewSegmentedBar total={data.capacity} segments={[{ value: data.registrationCount, className: 'bg-primary-500' }]} /></div>
          <p className="text-xs text-gray-700">{copy.remainingSeats} <bdi dir="ltr" className="font-semibold tabular-nums">{data.remainingSlots}</bdi></p>
        </div>}</Source>
      </Card>

      <div data-slot="overview-supporting-metrics" className="grid min-w-0 sm:grid-cols-3">
      <Card compact className="border-b border-border/60 sm:border-b-0" title={copy.suspendedTitle} subtitle={copy.suspendedSubtitle} icon={Users}>
        <Source query={overview} label={copy.suspendedLoad} locale={locale}>{(data) => <div className="space-y-2.5"><strong className="block text-2xl font-semibold leading-none tracking-tight tabular-nums"><bdi dir="ltr">{data.suspendedUserCount}</bdi></strong><p className="text-xs text-gray-700">{data.suspendedUserCount === 0 ? copy.confirmedZero : copy.suspendedAccounts}</p></div>}</Source>
      </Card>

      <Card compact className="border-b border-border/60 sm:border-b-0" title={copy.notificationTitle} subtitle={copy.notificationSubtitle} icon={Bell}>
        <Source query={notifications} label={copy.notificationLoad} locale={locale} onRetry={() => retryWindow('notifications', () => void notifications.refetch())}>{(data) => <div className="space-y-2.5">
          <div className="flex items-end justify-between gap-2"><strong className="block text-2xl font-semibold leading-none tracking-tight tabular-nums"><bdi dir="ltr">{data.rollup.total}</bdi></strong><span className="text-[11px] text-gray-600">{copy.total}</span></div>
          <p className="text-xs text-gray-700">{copy.sent} <bdi dir="ltr" className="font-semibold tabular-nums">{data.rollup.sent}</bdi> · {copy.failed} <bdi dir="ltr" className="font-semibold tabular-nums">{data.rollup.failed}</bdi></p>
          <OverviewSegmentedBar total={data.rollup.total} segments={[{ value: data.rollup.sent, className: 'bg-primary-500' }, { value: data.rollup.failed, className: 'bg-primary-700' }]} />
          {data.rollup.total === 0 ? <p className="text-xs font-medium">{copy.zeroNotifications}</p> : null}
          <CompactPeriod from={data.period.from} to={data.period.to} locale={locale} />
        </div>}</Source>
      </Card>

      <Card compact title={copy.applicationsTitle} subtitle={copy.applicationsSubtitle} icon={ClipboardList}>
        <Source query={applications} label={copy.applicationsLoad} locale={locale} onRetry={() => retryWindow('applications', () => void applications.refetch())}>{(data) => <div className="space-y-2.5">
          <strong className="block text-2xl font-semibold leading-none tracking-tight tabular-nums"><bdi dir="ltr">{data.total}</bdi></strong>
          <p className="text-xs text-gray-700">{data.total === 0 ? copy.zeroApplications : copy.currentStatusesBelow}</p>
          <OverviewSegmentedBar total={data.total} segments={Object.entries(data.byStatus).filter(([, count]) => count > 0).map(([, count], index) => ({ value: count, className: ['bg-primary-500', 'bg-primary-300', 'bg-primary-700', 'bg-primary-200', 'bg-gray-400', 'bg-gray-600'][index % 6] }))} />
          <CompactPeriod from={data.period.from} to={data.period.to} locale={locale} />
        </div>}</Source>
      </Card>
      </div>
      </div>
    </section>

    <div data-slot="overview-detail-columns" className="grid items-start gap-6 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
      <Card title={copy.financialTitle} subtitle={<span>{copy.sevenUtcDays} <bdi dir="ltr">UTC</bdi><span className="mt-1 block"><DateText value={windows.financial.from} /> — <DateText value={windows.financial.to} /></span></span>} icon={ChartNoAxesCombined}>
        <Source query={metrics} label={copy.financialLoad} locale={locale} onRetry={() => retryWindow('financial', () => void metrics.refetch())}>{(data) => {
          const recorded = data.recordedFinancials;
          const totals = recorded.totals;
          return <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={recorded.status === 'full' ? 'good' : recorded.status === 'unavailable' ? 'neutral' : 'warning'}>{recorded.status === 'full' ? copy.fullCoverage : recorded.status === 'partial' ? copy.partialCoverage : recorded.status === 'unresolved' ? copy.unresolvedEvidence : copy.unavailable}</Badge><span className="text-xs text-gray-600">{copy.knownAsOf} <DateText value={recorded.asOf} /></span></div>
            {recorded.actualCoveredRange ? <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[11px] leading-5 text-muted-foreground"><p className="font-medium">{copy.coveredRange}</p><PeriodText from={recorded.actualCoveredRange.from} to={recorded.actualCoveredRange.toExclusive} locale={locale} /></div> : <p className="text-xs text-gray-600">{copy.noCommonRange}</p>}
            {recorded.status === 'unresolved' ? <p role="status" className="rounded-lg bg-warning-50 p-3 text-warning-900">{copy.unresolvedFinancial}</p> : recorded.status === 'unavailable' ? <p role="status" className="rounded-lg bg-[#f1f1ed] p-3">{copy.unavailableFinancial}</p> : !totals ? <p role="status" className="rounded-lg bg-[#f1f1ed] p-3">{copy.totalsUnavailable}</p> : <>
              {recorded.status === 'partial' ? <p className="rounded-lg bg-warning-50 p-3 text-warning-900">{copy.partialDisclaimer}</p> : null}
              {recorded.status === 'full' && allAmountsZero(totals) ? <p className="font-medium">{copy.allZero}</p> : null}
              <dl className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-border/40 py-5 sm:grid-cols-3">
                <div data-slot="recorded-revenue-primary" className="col-span-2 pb-2 sm:col-span-3"><dt className="text-sm leading-5 text-muted-foreground">{copy.netRevenue}</dt><dd dir="ltr" className="mt-2 text-[30px] font-semibold leading-none tracking-tight tabular-nums sm:text-[38px]">{money.format(totals.recordedNetRevenueMinor / 100)}</dd></div>
                <div><dt className="text-xs leading-5 text-muted-foreground">{copy.estimatedMargin}</dt><dd dir="ltr" className="mt-1 text-base font-semibold tabular-nums">{preciseMoney.format(totals.estimatedContributionMarginMicroUsd / 1_000_000)}</dd></div>
                <div><dt className="text-xs leading-5 text-muted-foreground">{copy.grossRevenue}</dt><dd dir="ltr" className="mt-1 text-base font-semibold tabular-nums">{money.format(totals.grossRevenueMinor / 100)}</dd></div>
                <div><dt className="text-xs leading-5 text-muted-foreground">{copy.estimatedAiCost}</dt><dd dir="ltr" className="mt-1 text-base font-semibold tabular-nums">{preciseMoney.format(totals.estimatedAiCostMicroUsd / 1_000_000)}</dd></div>
              </dl>
              <RecordedNetDailyChart daily={recorded.daily} locale={locale} />
            </>}
            <p className="text-xs leading-5 text-gray-600">{copy.financialDisclaimer}</p>
            <div className="flex flex-wrap gap-x-5"><Link href="/admin/console/metrics" className={linkClass}>{copy.financialDetails}</Link><Link href="/admin/console/billing-completeness" className={linkClass}>{copy.financialChecks}</Link></div>
          </div>;
        }}</Source>
      </Card>

      <div className="min-w-0 space-y-6">
        <Card title={copy.distributionTitle} subtitle={copy.distributionSubtitle} icon={ClipboardList}>
          <Source query={applications} label={copy.distributionLoad} locale={locale} onRetry={() => retryWindow('applications', () => void applications.refetch())}>{(data) => <div className="space-y-3">
            {data.total === 0 ? <p className="text-sm font-medium">{copy.zeroDistribution}</p> : <ApplicationStatusChart data={data} locale={locale} />}
          </div>}</Source>
        </Card>

        <Card title={copy.webhookTitle} subtitle={<>{copy.webhookSubtitle}<span className="mt-1 block"><DateText value={windows.webhooks.from} /> — <DateText value={windows.webhooks.to} /> <bdi dir="ltr">UTC</bdi></span></>} icon={FileWarning}>
          <Source query={webhooks} label={copy.webhookLoad} locale={locale} onRetry={() => retryWindow('webhooks', () => void webhooks.refetch())}>{(data) => <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={data.coverage === 'covered' ? 'good' : 'warning'}>{data.coverage === 'covered' ? copy.capturedRange : data.coverage === 'partial' ? copy.partialCapture : copy.unavailableCapture}</Badge><span className="text-xs text-gray-600">{copy.asOf} <DateText value={data.asOf} /></span></div>
            {data.coverage === 'unavailable' ? <p>{copy.noCapture}</p> : data.items.length === 0 ? <p>{copy.noIssues}</p> : <ul className="space-y-2">{data.items.map((item) => <li key={item.id} className="border-t border-black/[0.07] pt-2"><span className="font-medium">{webhookStatus(item, locale)}</span><span className="block text-xs text-gray-600"><bdi dir="ltr" className="block break-all">{item.eventType}</bdi><DateText value={item.observedAt} /></span></li>)}</ul>}
            <Link href="/admin/console/verified-webhooks" className={linkClass}>{copy.inspectIssues}</Link>
          </div>}</Source>
        </Card>
      </div>
    </div>

    <aside aria-label={copy.activation} className="flex flex-wrap items-center gap-3 border-t border-black/[0.1] pt-4 text-xs">
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f1ed] text-gray-600"><Activity className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
      <strong className="font-semibold">{copy.activation}</strong><Badge>{copy.activationUnavailable}</Badge>
      <p className="basis-full text-gray-600 sm:me-auto sm:basis-auto">{copy.activationNote}</p>
    </aside>
  </section>;
}

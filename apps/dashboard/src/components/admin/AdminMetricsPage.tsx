'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminConsoleMetricsRequest } from '@applyai/shared-types';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Button } from '@/components/ui/Button';

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_RANGE_DAYS = 90;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): AdminConsoleMetricsRequest {
  const today = new Date();
  const to = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const from = new Date(to.getTime() - 29 * DAY_MS);
  return { from: utcDay(from), to: utcDay(to) };
}

function invalidRange(range: AdminConsoleMetricsRequest): boolean {
  const from = new Date(`${range.from}T00:00:00.000Z`);
  const to = new Date(`${range.to}T00:00:00.000Z`);
  const days = (to.getTime() - from.getTime()) / DAY_MS + 1;
  return !Number.isFinite(days) || days < 1 || days > MAX_RANGE_DAYS;
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const estimatedUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export function AdminMetricsPage() {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const params = useMemo(() => ({ from, to }), [from, to]);
  const invalid = invalidRange(params);
  const metrics = useQuery({
    queryKey: ['admin-console', 'metrics', params],
    queryFn: () => adminApiClient.adminConsole.metrics(params),
    enabled: !invalid,
    placeholderData: (previous) => previous,
  });

  if (invalid) {
    return (
      <MetricsState
        title="Invalid UTC date range"
        detail="Choose an inclusive range of 1 to 90 calendar days."
      />
    );
  }
  if (metrics.isLoading) return <MetricsSkeleton />;
  if (metrics.isError) {
    return (
      <MetricsState
        title="Could not load metrics"
        detail="The bounded aggregate metrics projection is unavailable."
        retry={() => void metrics.refetch()}
      />
    );
  }
  if (!metrics.data) return null;

  const data = metrics.data;
  const history = data.billing.history;
  const zero =
    data.billing.activePaidSubscriptions === 0 &&
    data.billing.monthlyRecurringRevenueMinor === 0 &&
    data.ai.requestCount === 0 &&
    (!history.totals ||
      (history.totals.newPaidSubscriptions === 0 &&
        history.totals.expansionMrrMinor === 0 &&
        history.totals.contractionMrrMinor === 0 &&
        history.totals.churnCount === 0 &&
        history.totals.churnedMrrMinor === 0 &&
        history.totals.reactivationCount === 0));
  const maxDailyRequests = Math.max(
    1,
    ...data.ai.daily.map((entry) => entry.requestCount),
  );

  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
          Admin Console
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Metrics</h1>
        <p className="mt-1 text-sm text-gray-600">
          Current paid subscriptions, deployment-bounded lifecycle history, and
          estimated AI operations cost.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 border border-stone-200 bg-white p-4">
        <label className="grid gap-1 text-xs font-medium text-gray-600">
          UTC from
          <input
            aria-label="Metrics UTC from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 rounded-md border border-stone-300 px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-gray-600">
          UTC to
          <input
            aria-label="Metrics UTC to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 rounded-md border border-stone-300 px-3 text-sm"
          />
        </label>
        <p className="text-xs text-gray-500">
          Inclusive UTC days · maximum {data.period.maximumDays} days
        </p>
      </div>

      {zero ? (
        <MetricsState
          title="No metrics recorded"
          detail="No active paid subscriptions or AI requests were recorded for this view."
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active paid subscriptions"
          value={data.billing.activePaidSubscriptions.toLocaleString()}
          detail={`${data.billing.activePaidSubscriptionsByPlan.pro} Pro · ${data.billing.activePaidSubscriptionsByPlan.premium} Premium`}
        />
        <MetricCard
          label="Current MRR"
          value={usd.format(data.billing.monthlyRecurringRevenueMinor / 100)}
          detail="Active Pro and Premium only · USD"
        />
        <MetricCard
          label="AI requests"
          value={data.ai.requestCount.toLocaleString()}
          detail={`${data.ai.costedRequestCount.toLocaleString()} with recorded estimates`}
        />
        <MetricCard
          label="Estimated AI cost"
          value={estimatedUsd.format(data.ai.estimatedCostUsd)}
          detail="Operational estimate · not settled cost"
        />
      </div>

      <article className="border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-semibold">Subscription lifecycle history</h2>
            <p className="text-xs text-gray-500">
              Available from {new Date(history.historyAvailableFrom).toISOString()}
            </p>
          </div>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            USD · UTC
          </span>
        </div>

        {history.requestedRangeStartsBeforeHistory ? (
          <div
            className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            role="status"
          >
            Subscription history before the availability timestamp is unavailable
            and is not represented as zero.
          </div>
        ) : null}

        {!history.actualCoveredRange || !history.totals ? (
          <div className="mt-4 border border-stone-200 bg-stone-50 p-4">
            <p className="font-medium">Historical billing data unavailable</p>
            <p className="mt-1 text-sm text-gray-600">
              The selected period is entirely before durable lifecycle recording
              began.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="New paid subscriptions"
                value={history.totals.newPaidSubscriptions.toLocaleString()}
                detail="Paid activations and trial conversions"
              />
              <MetricCard
                label="Expansion MRR"
                value={usd.format(history.totals.expansionMrrMinor / 100)}
                detail="Plan upgrades in the covered period"
              />
              <MetricCard
                label="Contraction MRR"
                value={usd.format(history.totals.contractionMrrMinor / 100)}
                detail="Plan downgrades in the covered period"
              />
              <MetricCard
                label="Churned subscriptions"
                value={history.totals.churnCount.toLocaleString()}
                detail={`${usd.format(history.totals.churnedMrrMinor / 100)} churned MRR`}
              />
              <MetricCard
                label="Reactivations"
                value={history.totals.reactivationCount.toLocaleString()}
                detail="Canceled, paused, or unpaid returning to active"
              />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table
                aria-label="Daily subscription lifecycle metrics"
                className="min-w-full border-collapse text-left text-xs"
              >
                <thead>
                  <tr className="border-b border-stone-200 text-gray-500">
                    <th className="px-2 py-2 font-medium">UTC day</th>
                    <th className="px-2 py-2 text-right font-medium">Coverage</th>
                    <th className="px-2 py-2 text-right font-medium">Active paid</th>
                    <th className="px-2 py-2 text-right font-medium">MRR</th>
                    <th className="px-2 py-2 text-right font-medium">New paid</th>
                    <th className="px-2 py-2 text-right font-medium">Churn</th>
                  </tr>
                </thead>
                <tbody>
                  {history.daily.map((entry) => (
                    <tr key={entry.day} className="border-b border-stone-100">
                      <td className="px-2 py-2 font-medium">{entry.day}</td>
                      <td className="px-2 py-2 text-right capitalize text-gray-500">
                        {entry.coverage}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {entry.activePaidSubscriptions}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {usd.format(entry.monthlyRecurringRevenueMinor / 100)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {entry.newPaidSubscriptions}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {entry.churnCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <article className="border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-semibold">Daily AI request volume</h2>
            <p className="text-xs text-gray-500">
              {data.period.from} through {data.period.to} · {data.period.timeZone}
            </p>
          </div>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            Estimated cost
          </span>
        </div>
        <div
          aria-label="Daily AI metrics chart"
          className="mt-4 max-h-96 space-y-2 overflow-y-auto"
        >
          {data.ai.daily.map((entry) => (
            <div
              key={entry.day}
              className="grid grid-cols-[6.5rem_minmax(5rem,1fr)_5rem_7rem] items-center gap-2 text-xs"
            >
              <span className="font-medium text-gray-600">{entry.day}</span>
              <span className="h-2 bg-stone-100" aria-hidden="true">
                <span
                  className="block h-2 bg-orange-500"
                  style={{
                    width: `${Math.max(
                      entry.requestCount === 0
                        ? 0
                        : (entry.requestCount / maxDailyRequests) * 100,
                      0,
                    )}%`,
                  }}
                />
              </span>
              <span className="text-right tabular-nums">
                {entry.requestCount} requests
              </span>
              <span className="text-right tabular-nums text-gray-500">
                {estimatedUsd.format(entry.estimatedCostUsd)} est.
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="border border-stone-200 bg-white p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-gray-500">{detail}</p>
    </article>
  );
}

function MetricsState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <section className="border border-stone-200 bg-white p-6">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-gray-600">{detail}</p>
      {retry ? (
        <Button
          className="mt-4"
          variant="outline"
          size="sm"
          onClick={retry}
        >
          Retry
        </Button>
      ) : null}
    </section>
  );
}

function MetricsSkeleton() {
  return (
    <section className="space-y-4" aria-label="Loading metrics">
      <div className="h-12 w-48 animate-pulse bg-stone-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse border border-stone-200 bg-white"
          />
        ))}
      </div>
    </section>
  );
}

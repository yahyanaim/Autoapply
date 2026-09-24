'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminConsoleApplicationsRequest,
  AdminConsoleJobsRequest,
  AdminConsoleNotificationsRequest,
} from '@applyai/shared-types';
import {
  JobDeactivationReason,
  ResumeParseFailureCategory,
  ResumeRequeueReason,
} from '@applyai/shared-types';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Button } from '@/components/ui/Button';

const PAGE_SIZE = 20;

function Header({ title, detail }: { title: string; detail: string }) {
  return <header><p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">Admin Console</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-gray-600">{detail}</p></header>;
}

function State({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return <section className="border border-stone-200 bg-white p-6"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-gray-600">{detail}</p>{retry ? <Button className="mt-4" variant="outline" size="sm" onClick={retry}>Retry</Button> : null}</section>;
}

function Loading({ label }: { label: string }) {
  return <div className="space-y-4" aria-label={label}><div className="h-12 w-48 animate-pulse bg-stone-200" /><div className="h-72 animate-pulse border border-stone-200 bg-white" /></div>;
}

function Pagination({ cursor, setCursor, history, setHistory, nextCursor }: { cursor?: string; setCursor: (value?: string) => void; history: Array<string | undefined>; setHistory: React.Dispatch<React.SetStateAction<Array<string | undefined>>>; nextCursor: string | null }) {
  const next = typeof nextCursor === 'string' && nextCursor.trim() ? nextCursor : undefined;
  return <div className="flex items-center justify-between gap-3"><Button variant="outline" size="sm" disabled={!history.length} onClick={() => { const previous = history.length ? history[history.length - 1] : undefined; setHistory((items) => items.slice(0, -1)); setCursor(previous); }}>Previous</Button><span className="text-xs text-gray-500">Cursor pagination</span>{next ? <Button variant="outline" size="sm" onClick={() => { setHistory((items) => [...items, cursor]); setCursor(next); }}>Next</Button> : <span />}</div>;
}

function requeueReasonFor(
  category: ResumeParseFailureCategory,
): ResumeRequeueReason | undefined {
  if (category === ResumeParseFailureCategory.provider_transient) {
    return ResumeRequeueReason.provider_recovered;
  }
  if (category === ResumeParseFailureCategory.storage_transient) {
    return ResumeRequeueReason.storage_recovered;
  }
  if (category === ResumeParseFailureCategory.worker_crash) {
    return ResumeRequeueReason.worker_recovery;
  }
  return undefined;
}

export function AdminJobsPage() {
  const [search, setSearch] = useState('');
  const [eligibility, setEligibility] = useState<'' | 'eligible' | 'stale'>('');
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const [reason, setReason] = useState<JobDeactivationReason>(
    JobDeactivationReason.invalid_listing,
  );
  const [code, setCode] = useState('');
  const queryClient = useQueryClient();
  useEffect(() => { setCursor(undefined); setHistory([]); }, [search, eligibility]);
  const params = useMemo<AdminConsoleJobsRequest>(() => ({ limit: PAGE_SIZE, ...(cursor ? { cursor } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(eligibility ? { eligibility } : {}) }), [cursor, eligibility, search]);
  const query = useQuery({ queryKey: ['admin-console', 'jobs', params], queryFn: () => adminApiClient.adminConsole.jobs(params) });
  const deactivate = useMutation({
    mutationFn: async (jobId: string) => {
      const issued = await adminApiClient.adminConsole.issueStepUp({
        code,
        action: 'admin.job.deactivate',
        targetType: 'job',
        targetId: jobId,
      });
      return adminApiClient.adminConsole.deactivateJob(jobId, {
        reason,
        stepUpProof: issued.proof,
      });
    },
    onSuccess: async () => {
      setCode('');
      setSelectedJobId(undefined);
      await queryClient.invalidateQueries({ queryKey: ['admin-console', 'jobs'] });
    },
  });
  if (query.isLoading) return <Loading label="Loading jobs" />;
  if (query.isError) return <State title="Could not load jobs" detail="The operational jobs projection is unavailable." retry={() => void query.refetch()} />;
  const data = query.data;
  if (!data) return null;
  return <section className="space-y-5"><Header title="Jobs Moderation" detail="Observed job records, discovery eligibility, and durable administrative deactivation." /><div className="flex flex-wrap gap-3 border border-stone-200 bg-white p-3"><input aria-label="Search jobs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or company" className="h-9 min-w-64 rounded-md border border-stone-300 px-3 text-sm" /><select aria-label="Filter job eligibility" value={eligibility} onChange={(event) => setEligibility(event.target.value as typeof eligibility)} className="h-9 rounded-md border border-stone-300 px-3 text-sm"><option value="">All eligibility</option><option value="eligible">Eligible</option><option value="stale">Stale or deactivated</option></select></div>{data.jobs.length ? <div className="overflow-x-auto border border-stone-200 bg-white"><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Job</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Last observed</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-stone-100">{data.jobs.map((job) => <tr key={job.id}><td className="px-4 py-3"><p className="font-medium">{job.title}</p><p className="text-xs text-gray-500">{job.company ?? 'Unknown company'} · {job.location ?? 'Unspecified'}</p></td><td className="px-4 py-3">{job.source ?? '—'}</td><td className="px-4 py-3 whitespace-nowrap">{new Date(job.lastObservedAt).toLocaleString()}</td><td className="px-4 py-3"><span className={job.status === 'active' && job.eligible ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800' : 'rounded-full bg-stone-100 px-2 py-1 text-xs text-gray-600'}>{job.status === 'deactivated' ? 'Deactivated' : job.eligible ? 'Eligible' : 'Stale'}</span></td><td className="px-4 py-3">{job.status === 'active' ? <Button variant="outline" size="sm" onClick={() => { setSelectedJobId(job.id); setCode(''); deactivate.reset(); }}>Deactivate</Button> : <span className="text-xs text-gray-500">Historical only</span>}</td></tr>)}</tbody></table></div> : <State title="No jobs found" detail="No jobs match the approved filters." />}{selectedJobId ? <form className="grid gap-3 border border-orange-200 bg-orange-50 p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); deactivate.mutate(selectedJobId); }}><label className="grid gap-1 text-xs font-medium text-gray-700">Reason<select aria-label="Deactivation reason" value={reason} onChange={(event) => setReason(event.target.value as JobDeactivationReason)} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm"><option value="provider_removed">Provider removed</option><option value="invalid_listing">Invalid listing</option><option value="duplicate">Duplicate</option><option value="policy_violation">Policy violation</option><option value="security_risk">Security risk</option><option value="other">Other</option></select></label><label className="grid gap-1 text-xs font-medium text-gray-700">Authenticator code<input aria-label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm" /></label><Button type="submit" size="sm" disabled={code.length !== 6 || deactivate.isPending}>{deactivate.isPending ? 'Deactivating…' : 'Confirm deactivation'}</Button><Button type="button" variant="outline" size="sm" onClick={() => setSelectedJobId(undefined)}>Cancel</Button>{deactivate.isError ? <p role="alert" className="text-sm text-red-700 sm:col-span-4">Job deactivation failed. Verify the step-up code and retry.</p> : null}</form> : null}<Pagination cursor={cursor} setCursor={setCursor} history={history} setHistory={setHistory} nextCursor={data.nextCursor} /></section>;
}

export function AdminResumeFailuresPage() {
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>();
  const [reason, setReason] = useState<ResumeRequeueReason>();
  const [code, setCode] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin-console', 'resume-failures', cursor], queryFn: () => adminApiClient.adminConsole.resumeFailures({ limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }) });
  const requeue = useMutation({
    mutationFn: async (resumeId: string) => {
      if (!reason || !idempotencyKey) throw new Error('Missing safe requeue context');
      const issued = await adminApiClient.adminConsole.issueStepUp({
        code,
        action: 'admin.resume.requeue',
        targetType: 'resume',
        targetId: resumeId,
      });
      return adminApiClient.adminConsole.requeueResume(resumeId, {
        reason,
        stepUpProof: issued.proof,
        idempotencyKey,
      });
    },
    onSuccess: async () => {
      setCode('');
      setReason(undefined);
      setSelectedResumeId(undefined);
      setIdempotencyKey('');
      await queryClient.invalidateQueries({ queryKey: ['admin-console', 'resume-failures'] });
    },
  });
  if (query.isLoading) return <Loading label="Loading resume failures" />;
  if (query.isError) return <State title="Could not load resume failures" detail="The safe failure projection is unavailable." retry={() => void query.refetch()} />;
  const data = query.data;
  if (!data) return null;
  return <section className="space-y-5"><Header title="Resume Failures" detail="Sanitized processing state with one bounded administrative requeue for explicitly transient failures." />{data.failures.length ? <div className="overflow-x-auto border border-stone-200 bg-white"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Resume reference</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Failure</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Failed</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-stone-100">{data.failures.map((failure) => { const mappedReason = requeueReasonFor(failure.failureCategory); return <tr key={failure.resumeId}><td className="px-4 py-3 font-mono text-xs">{failure.resumeId}</td><td className="px-4 py-3">{failure.mimeType ?? 'Unknown'}</td><td className="px-4 py-3">{failure.failureCategory.replaceAll('_', ' ')}</td><td className="px-4 py-3 tabular-nums">{failure.executionCount}</td><td className="px-4 py-3 whitespace-nowrap">{new Date(failure.failedAt).toLocaleString()}</td><td className="px-4 py-3">{failure.requeueable && mappedReason ? <Button variant="outline" size="sm" onClick={() => { setSelectedResumeId(failure.resumeId); setReason(mappedReason); setCode(''); setIdempotencyKey(crypto.randomUUID()); requeue.reset(); }}>Requeue</Button> : <span className="text-xs text-gray-500">Not requeueable</span>}</td></tr>; })}</tbody></table></div> : <State title="No resume failures" detail="No failed resume-processing records were returned." />}{selectedResumeId && reason ? <form className="grid gap-3 border border-orange-200 bg-orange-50 p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); requeue.mutate(selectedResumeId); }}><p className="text-sm text-gray-700"><span className="block text-xs font-medium">Approved reason</span>{reason.replaceAll('_', ' ')}</p><label className="grid gap-1 text-xs font-medium text-gray-700">Authenticator code<input aria-label="Resume requeue authenticator code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm" /></label><Button type="submit" size="sm" disabled={code.length !== 6 || requeue.isPending}>{requeue.isPending ? 'Requesting…' : 'Confirm requeue'}</Button><Button type="button" variant="outline" size="sm" onClick={() => { setSelectedResumeId(undefined); setReason(undefined); setIdempotencyKey(''); }}>Cancel</Button>{requeue.isError ? <p role="alert" className="text-sm text-red-700 sm:col-span-4">Resume requeue failed. Verify eligibility and the step-up code, then retry.</p> : null}</form> : null}<Pagination cursor={cursor} setCursor={setCursor} history={history} setHistory={setHistory} nextCursor={data.nextCursor} /></section>;
}

export function AdminBetaGatePage() {
  const query = useQuery({ queryKey: ['admin-console', 'beta-gate'], queryFn: () => adminApiClient.adminConsole.betaGate() });
  if (query.isLoading) return <Loading label="Loading Beta Gate" />;
  if (query.isError) return <State title="Could not load Beta Gate" detail="The durable gate summary is unavailable." retry={() => void query.refetch()} />;
  if (!query.data) return null;
  const gate = query.data;
  return <section className="space-y-5"><Header title="Beta Gate" detail="Durable registration capacity. Runtime configuration is read-only." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Registrations', gate.registrationCount], ['Capacity', gate.capacity], ['Remaining', gate.remainingSlots], ['Status', gate.status]].map(([label, value]) => <article key={label} className="border border-stone-200 bg-white p-5"><p className="text-sm text-gray-600">{label}</p><p className="mt-2 text-3xl font-semibold capitalize tabular-nums">{value}</p></article>)}</div>{!gate.enabled ? <p className="border border-stone-200 bg-stone-50 p-4 text-sm text-gray-600">Beta mode is disabled. This page does not change runtime configuration.</p> : null}</section>;
}

export function AdminNotificationsPage() {
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const params = useMemo<AdminConsoleNotificationsRequest>(() => ({ limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }), [cursor]);
  const query = useQuery({ queryKey: ['admin-console', 'notifications', params], queryFn: () => adminApiClient.adminConsole.notifications(params) });
  if (query.isLoading) return <Loading label="Loading notification operations" />;
  if (query.isError) return <State title="Could not load notifications" detail="The bounded delivery summary is unavailable." retry={() => void query.refetch()} />;
  const data = query.data;
  if (!data) return null;
  return <section className="space-y-5"><Header title="Notifications" detail="Delivery counts and sanitized failures from the last 24 hours." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Object.entries(data.rollup).map(([label, value]) => <article key={label} className="border border-stone-200 bg-white p-4"><p className="text-xs uppercase text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></article>)}</div>{data.failures.length ? <div className="overflow-x-auto border border-stone-200 bg-white"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Failure</th><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Created</th></tr></thead><tbody className="divide-y divide-stone-100">{data.failures.map((failure) => <tr key={failure.id}><td className="px-4 py-3 font-mono text-xs">{failure.id}</td><td className="px-4 py-3">{failure.channel}</td><td className="px-4 py-3">{new Date(failure.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <State title="No delivery failures" detail="No failed notifications occurred in this bounded period." />}<Pagination cursor={cursor} setCursor={setCursor} history={history} setHistory={setHistory} nextCursor={data.nextCursor} /></section>;
}

export function AdminApplicationsPage() {
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const invalid = Boolean(createdFrom && createdTo && createdFrom > createdTo);
  const params = useMemo<AdminConsoleApplicationsRequest>(() => ({ ...(createdFrom ? { createdFrom: new Date(createdFrom).toISOString() } : {}), ...(createdTo ? { createdTo: new Date(createdTo).toISOString() } : {}) }), [createdFrom, createdTo]);
  const query = useQuery({ queryKey: ['admin-console', 'applications', params], queryFn: () => adminApiClient.adminConsole.applications(params), enabled: !invalid });
  if (invalid) return <State title="Invalid date range" detail="The start date must be before the end date." />;
  if (query.isLoading) return <Loading label="Loading aggregate applications" />;
  if (query.isError) return <State title="Could not load applications" detail="The aggregate application summary is unavailable." retry={() => void query.refetch()} />;
  if (!query.data) return null;
  return <section className="space-y-5"><Header title="Aggregate Applications" detail="Non-attributable application volumes only." /><div className="flex flex-wrap gap-3 border border-stone-200 bg-white p-3"><label className="grid gap-1 text-xs text-gray-600">Created from<input type="datetime-local" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} className="h-9 rounded-md border border-stone-300 px-3 text-sm" /></label><label className="grid gap-1 text-xs text-gray-600">Created to<input type="datetime-local" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} className="h-9 rounded-md border border-stone-300 px-3 text-sm" /></label></div><article className="border border-stone-200 bg-white p-5"><p className="text-sm text-gray-600">Total applications</p><p className="mt-2 text-4xl font-semibold tabular-nums">{query.data.total}</p></article><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(query.data.byStatus).map(([status, count]) => <article key={status} className="border border-stone-200 bg-white p-4"><p className="text-sm capitalize text-gray-600">{status.replaceAll('_', ' ')}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p></article>)}</div></section>;
}

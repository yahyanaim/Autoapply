'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  QuotaGrantCategory,
  QuotaGrantReason,
  type AdminConsoleUsageCategory,
} from '@applyai/shared-types';

export function AdminUserDetailPage({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(QuotaGrantCategory.applications);
  const [reason, setReason] = useState(QuotaGrantReason.customer_support);
  const [amount, setAmount] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedTargetUserId, setConfirmedTargetUserId] = useState<string | null>(null);
  const grantIntent = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    setConfirmed(false);
    setConfirmedTargetUserId(null);
    grantIntent.current = null;
  }, [userId]);
  const user = useQuery({ queryKey: ['admin-console', 'user', userId], queryFn: () => adminApiClient.adminConsole.user(userId) });
  const sessions = useQuery({ queryKey: ['admin-console', 'user-sessions', userId], queryFn: () => adminApiClient.adminConsole.userSessions(userId, { limit: 20 }), enabled: user.isSuccess });
  const usage = useQuery({ queryKey: ['admin-console', 'usage', userId], queryFn: () => adminApiClient.adminConsole.userUsageLimits(userId), enabled: user.isSuccess });
  const grant = useMutation({
    mutationFn: async () => {
      const utcExpiry = new Date(`${expiresAt}Z`).toISOString();
      const fingerprint = JSON.stringify({ userId, category, reason, amount: Number(amount), expiresAt: utcExpiry });
      if (grantIntent.current?.fingerprint !== fingerprint) {
        grantIntent.current = { fingerprint, key: crypto.randomUUID() };
      }
      const idempotencyKey = grantIntent.current.key;
      const issued = await adminApiClient.adminConsole.issueStepUp({
        code,
        action: 'admin.quota.grant',
        targetType: 'user',
        targetId: userId,
      });
      return adminApiClient.adminConsole.grantUserQuota(userId, {
        category,
        reason,
        amount: Number(amount),
        expiresAt: utcExpiry,
        idempotencyKey,
        stepUpProof: issued.proof,
      });
    },
    onSuccess: async () => {
      grantIntent.current = null;
      setCode('');
      setConfirmed(false);
      setConfirmedTargetUserId(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-console', 'usage', userId] });
    },
  });
  if (user.isLoading) return <DetailSkeleton />;
  if (user.isError) return <DetailState title="Could not load user" retry={() => void user.refetch()} />;
  if (!user.data) return null;
  const detail = user.data;
  const grantConfirmed = confirmed && confirmedTargetUserId === userId;
  const canSubmitGrant = grantConfirmed && code.length === 6 && Boolean(expiresAt) && Number.isInteger(Number(amount)) && Number(amount) > 0 && !grant.isPending;
  return <section className="space-y-6"><Link href="/admin/console/users" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-950"><ArrowLeft className="h-4 w-4" />Back to users</Link><header className="border border-stone-200 bg-white p-5"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">User detail</p><h1 className="mt-1 break-all text-xl font-semibold tracking-tight">{detail.email}</h1><p className="mt-1 font-mono text-xs text-gray-400">{detail.id}</p></div><div className="flex gap-2"><Badge variant={detail.status === 'active' ? 'success' : 'danger'}>{detail.status}</Badge><Badge variant="outline">{detail.plan ?? 'No plan'}</Badge></div></div><dl className="mt-5 grid gap-4 border-t border-stone-100 pt-4 text-sm sm:grid-cols-3"><Info label="Role" value={detail.role.replace('_', ' ')} /><Info label="Email verified" value={detail.isEmailVerified ? 'Yes' : 'No'} /><Info label="Joined" value={new Date(detail.createdAt).toLocaleDateString()} /></dl></header>
    <section><h2 className="mb-3 text-base font-semibold">Sessions</h2>{sessions.isLoading ? <DetailSkeleton /> : sessions.isError ? <DetailState title="Could not load sessions" retry={() => void sessions.refetch()} /> : sessions.data?.sessions.length ? <div className="overflow-x-auto border border-stone-200 bg-white"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b bg-stone-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Client</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Last used</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Current</th></tr></thead><tbody className="divide-y divide-stone-100">{sessions.data.sessions.map((session) => <tr key={session.id}><td className="px-4 py-3 capitalize">{session.clientType}</td><td className="px-4 py-3">{new Date(session.createdAt).toLocaleString()}</td><td className="px-4 py-3">{new Date(session.lastUsedAt).toLocaleString()}</td><td className="px-4 py-3">{new Date(session.expiresAt).toLocaleString()}</td><td className="px-4 py-3">{session.current ? <Badge variant="info">Current</Badge> : '—'}</td></tr>)}</tbody></table></div> : <DetailState title="No active sessions" />}</section>
    <section><h2 className="mb-3 text-base font-semibold">Usage limits</h2>{usage.isLoading ? <DetailSkeleton /> : usage.isError ? <DetailState title="Could not load usage limits" retry={() => void usage.refetch()} /> : usage.data ? <div className="border border-stone-200 bg-white"><div className="flex flex-wrap justify-between gap-3 border-b border-stone-100 px-4 py-3 text-sm"><span className="capitalize text-gray-700">{usage.data.plan} plan</span><span className="text-gray-500">Resets {new Date(usage.data.resetAt).toLocaleDateString()}</span></div><dl className="grid divide-y divide-stone-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">{(Object.entries(usage.data.usage) as [string, AdminConsoleUsageCategory][]).map(([name, value]) => <div key={name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><dt className="capitalize text-gray-700">{name.replace(/([A-Z])/g, ' $1')}</dt><dd className="font-medium tabular-nums">{value.unlimited ? 'Unlimited' : `${value.used} / ${value.limit} · ${value.remaining} remaining`}</dd></div>)}</dl></div> : null}
      <form className="mt-4 grid gap-3 border border-orange-200 bg-orange-50 p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (canSubmitGrant) grant.mutate(); }}>
        <div className="md:col-span-2"><h3 className="font-semibold">Temporary additive quota grant</h3><p className="mt-1 text-sm text-gray-600">Adds capacity until the UTC expiry. It does not change the plan or reset existing usage.</p></div>
        <Field label="Quota category"><select aria-label="Quota category" value={category} onChange={(event) => { setCategory(event.target.value as QuotaGrantCategory); setConfirmed(false); }} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm">{Object.values(QuotaGrantCategory).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></Field>
        <Field label="Amount"><input aria-label="Quota amount" type="number" min="1" step="1" required value={amount} onChange={(event) => { setAmount(event.target.value); setConfirmed(false); }} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm" /></Field>
        <Field label="UTC expiry"><input aria-label="Quota UTC expiry" type="datetime-local" required value={expiresAt} onChange={(event) => { setExpiresAt(event.target.value); setConfirmed(false); }} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm" /></Field>
        <Field label="Reason"><select aria-label="Quota grant reason" value={reason} onChange={(event) => { setReason(event.target.value as QuotaGrantReason); setConfirmed(false); }} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm">{Object.values(QuotaGrantReason).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></Field>
        <Field label="Authenticator code"><input aria-label="Quota grant authenticator code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm" /></Field>
        <div aria-label="Quota grant confirmation details" className="grid gap-1 border border-orange-200 bg-white p-3 text-sm md:col-span-2"><p>Target: {detail.email} ({detail.id})</p><p>Category: {category.replaceAll('_', ' ')}</p><p>Amount: {amount}</p><p>Expires: {expiresAt ? `${expiresAt.replace('T', ' ')} UTC` : 'Not set'}</p><p>Reason: {reason.replaceAll('_', ' ')}</p></div>
        <label className="flex items-start gap-2 text-sm text-gray-700 md:col-span-2"><input aria-label="Confirm temporary quota grant" type="checkbox" checked={grantConfirmed} onChange={(event) => { setConfirmed(event.target.checked); setConfirmedTargetUserId(event.target.checked ? userId : null); }} className="mt-1" />I confirm the target, category, amount, UTC expiration, and reason shown above.</label>
        <div className="flex items-center gap-3 md:col-span-2"><Button type="submit" disabled={!canSubmitGrant}>{grant.isPending ? 'Granting…' : 'Grant temporary quota'}</Button>{grant.isSuccess ? <p role="status" className="text-sm text-emerald-700">Temporary quota granted. Effective limit: {grant.data.effectiveLimit ?? 'Unlimited'}; remaining: {grant.data.remaining ?? 'Unlimited'}.</p> : null}{grant.isError ? <p role="alert" className="text-sm text-red-700">Quota grant failed. Verify eligibility, expiry, and step-up code.</p> : null}</div>
      </form>
    </section>
  </section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1 text-xs font-medium text-gray-700">{label}{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt><dd className="mt-1 capitalize text-gray-800">{value}</dd></div>; }
function DetailState({ title, retry }: { title: string; retry?: () => void }) { return <div className="border border-stone-200 bg-white p-5"><p className="text-sm font-medium">{title}</p>{retry ? <Button variant="outline" size="sm" className="mt-3" onClick={retry}>Retry</Button> : null}</div>; }
function DetailSkeleton() { return <div aria-label="Loading user detail" className="h-40 animate-pulse border border-stone-200 bg-white" />; }

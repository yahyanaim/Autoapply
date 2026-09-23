'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SubscriptionPlan, UserRole, UserStatus } from '@applyai/shared-types';
import { adminApiClient } from '@/lib/api/admin-api-client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const pageSize = 20;

function badgeVariant(status: string) {
  return status === 'active' ? 'success' : status === 'suspended' ? 'danger' : 'secondary';
}

export function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [plan, setPlan] = useState<SubscriptionPlan | ''>('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);
  const query = { limit: pageSize, cursor, ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status } : {}), ...(role ? { role } : {}), ...(plan ? { plan } : {}) };
  const users = useQuery({ queryKey: ['admin-console', 'users', query], queryFn: () => adminApiClient.adminConsole.users(query) });

  useEffect(() => { setCursor(undefined); setHistory([]); }, [search, status, role, plan]);

  if (users.isLoading) return <UsersSkeleton />;
  if (users.isError) return <State title="Could not load users" detail="The request did not return a safe user page." retry={() => void users.refetch()} />;
  const data = users.data;
  if (!data) return null;

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">Admin Console</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Users</h1><p className="mt-1 text-sm text-gray-600">Sanitized account records only.</p></div><p className="text-sm tabular-nums text-gray-500">{data.users.length} shown</p></div>
    <div className="grid gap-3 border border-stone-200 bg-white p-3 md:grid-cols-[minmax(240px,1fr)_repeat(3,160px)]">
      <label className="grid gap-1.5 text-xs font-medium text-gray-700">Search email<input aria-label="Search users by email" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" placeholder="name@example.com" /></label>
      <Filter label="Status" value={status} onChange={(value) => setStatus(value as UserStatus | '')} options={['active', 'suspended']} />
      <Filter label="Role" value={role} onChange={(value) => setRole(value as UserRole | '')} options={['user', 'org_admin', 'platform_admin']} />
      <Filter label="Plan" value={plan} onChange={(value) => setPlan(value as SubscriptionPlan | '')} options={['free', 'pro', 'premium']} />
    </div>
    {data.users.length === 0 ? <State title="No users found" detail="Try broadening the approved search or filters." /> : <div className="overflow-x-auto border border-stone-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3"><span className="sr-only">View</span></th></tr></thead><tbody className="divide-y divide-stone-100">{data.users.map((user) => <tr key={user.id} className="hover:bg-stone-50"><td className="px-4 py-3"><p className="font-medium text-gray-950">{user.email}</p><p className="mt-0.5 font-mono text-xs text-gray-400">{user.id}</p></td><td className="px-4 py-3 text-gray-700">{user.role.replace('_', ' ')}</td><td className="px-4 py-3"><Badge variant={badgeVariant(user.status)}>{user.status}</Badge></td><td className="px-4 py-3 capitalize text-gray-700">{user.plan ?? '—'}</td><td className="px-4 py-3 text-gray-600">{new Date(user.createdAt).toLocaleDateString()}</td><td className="px-4 py-3 text-right"><Link href={`/admin/console/users/${encodeURIComponent(user.id)}`} className="text-sm font-semibold text-orange-700 hover:text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-400">View<span className="sr-only"> {user.email}</span></Link></td></tr>)}</tbody></table></div>}
    <div className="flex items-center justify-between"><Button variant="outline" size="sm" disabled={history.length === 0} onClick={() => { const previous = history.at(-1); setHistory((items) => items.slice(0, -1)); setCursor(previous); }}>Previous</Button><p className="text-xs text-gray-500">Cursor pagination</p><Button variant="outline" size="sm" disabled={!data.nextCursor} onClick={() => { if (data.nextCursor) { setHistory((items) => [...items, cursor ?? '']); setCursor(data.nextCursor); } }}>Next</Button></div>
  </section>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label className="grid gap-1.5 text-xs font-medium text-gray-700">{label}<select aria-label={`Filter by ${label}`} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"><option value="">All</option>{options.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}</select></label>; }
function State({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) { return <div className="border border-stone-200 bg-white p-6"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-gray-600">{detail}</p>{retry ? <Button className="mt-4" variant="outline" size="sm" onClick={retry}>Retry</Button> : null}</div>; }
function UsersSkeleton() { return <div className="space-y-4" aria-label="Loading users"><div className="h-12 w-48 animate-pulse bg-stone-200" /><div className="h-16 animate-pulse border border-stone-200 bg-white" /><div className="h-80 animate-pulse border border-stone-200 bg-white" /></div>; }

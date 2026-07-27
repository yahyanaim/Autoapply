'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  Application,
  ApplicationStatus,
  useApplications,
  useApplicationUsage,
} from '@/lib/api/hooks/use-applications';

const statuses: ApplicationStatus[] = ['draft', 'submitted', 'viewed', 'interview', 'offer', 'rejected'];
const nextStatuses: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['submitted'], submitted: ['viewed', 'interview', 'offer', 'rejected'], viewed: ['interview', 'offer', 'rejected'], interview: ['offer', 'rejected'], offer: [], rejected: [],
};
const variants: Record<ApplicationStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'info', submitted: 'info', viewed: 'warning', interview: 'warning', offer: 'success', rejected: 'danger',
};

export default function ApplicationsPage() {
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [filter, setFilter] = useState<ApplicationStatus | undefined>();
  const [error, setError] = useState('');
  const { applications, update } = useApplications({ status: filter, limit: 100 });
  const usage = useApplicationUsage();
  const items = applications.data?.applications ?? [];

  const changeStatus = async (application: Application, status: ApplicationStatus) => {
    setError('');
    try {
      await update.mutateAsync({ id: application.id, status });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Status update failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Applications</h1><p className="mt-1 text-sm text-gray-500">{applications.data?.total ?? 0} tracked applications</p></div>
        <div className="flex rounded-lg border border-gray-200 p-1">
          {(['list', 'kanban'] as const).map((option) => <button key={option} onClick={() => setView(option)} className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${view === option ? 'bg-gray-100 text-gray-900' : 'text-gray-500'}`}>{option}</button>)}
        </div>
      </div>

      {usage.data && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Monthly tracking usage</p>
            <p className="mt-1 text-xs text-gray-500">
              {usage.data.unlimited
                ? `${usage.data.used.toLocaleString()} applications created this month · no plan limit`
                : `${usage.data.used.toLocaleString()} of ${usage.data.maximum.toLocaleString()} applications created this month`}
            </p>
          </div>
          <p className="text-xs text-gray-500">
            Resets {new Date(usage.data.resetAt).toLocaleDateString()}. Deleting an application does not restore monthly usage.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter(undefined)} className={`rounded-full px-3 py-1 text-sm font-medium ${!filter ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>All</button>
        {statuses.map((status) => <button key={status} onClick={() => setFilter(status)} className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${filter === status ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>{status}</button>)}
      </div>

      {error && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
      {applications.isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
      {applications.isError && <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">{applications.error.message}</div>}
      {!applications.isLoading && items.length === 0 && <Card className="py-14 text-center text-sm text-gray-500">No applications in this view. Add a job from the Jobs page.</Card>}

      {view === 'list' && items.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500"><tr><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Next step</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((application) => (
                <tr key={application.id}>
                  <td className="px-5 py-4">
                    <Link href={`/applications/${application.id}`} className="font-medium text-gray-900 hover:text-primary-600">
                      {application.job.title}
                    </Link>
                    <p className="text-sm text-gray-500">{application.job.company?.name || 'Company not listed'}</p>
                  </td>
                  <td className="px-5 py-4"><Badge variant={variants[application.status]}>{application.status}</Badge></td>
                  <td className="px-5 py-4 text-sm text-gray-500">{new Date(application.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-4"><StatusControl application={application} onChange={changeStatus} disabled={update.isPending} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {view === 'kanban' && (
        <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
          {statuses.map((status) => (
            <div key={status} className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold capitalize text-gray-700">{status}</h2><span className="text-xs text-gray-400">{items.filter((item) => item.status === status).length}</span></div>
              {items.filter((item) => item.status === status).map((application) => <Card key={application.id} className="p-4"><Link href={`/applications/${application.id}`} className="text-sm font-semibold text-gray-900 hover:text-primary-600">{application.job.title}</Link><p className="mt-1 text-xs text-gray-500">{application.job.company?.name || 'Company not listed'}</p><div className="mt-3"><StatusControl application={application} onChange={changeStatus} disabled={update.isPending} /></div></Card>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusControl({ application, onChange, disabled }: { application: Application; onChange: (application: Application, status: ApplicationStatus) => Promise<void>; disabled: boolean }) {
  const next = nextStatuses[application.status];
  if (!next.length) return <span className="text-xs text-gray-400">No further transition</span>;
  return <select aria-label={`Update ${application.job.title} status`} defaultValue="" disabled={disabled} onChange={(event) => { const status = event.target.value as ApplicationStatus; if (status) void onChange(application, status); event.currentTarget.value = ''; }} className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700"><option value="" disabled>Move to…</option>{next.map((status) => <option key={status} value={status}>{status}</option>)}</select>;
}

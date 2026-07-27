'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import {
  ApplicationStatus,
  useApplication,
} from '@/lib/api/hooks/use-applications';

const nextStatuses: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['submitted'],
  submitted: ['viewed', 'interview', 'offer', 'rejected'],
  viewed: ['interview', 'offer', 'rejected'],
  interview: ['offer', 'rejected'],
  offer: [],
  rejected: [],
};

const variants: Record<ApplicationStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'info',
  submitted: 'info',
  viewed: 'warning',
  interview: 'warning',
  offer: 'success',
  rejected: 'danger',
};

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const { application, addNote, update, remove } = useApplication(id);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const timeline = useMemo(
    () => [...(application.data?.timeline ?? [])].sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    ),
    [application.data?.timeline],
  );

  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) return;
    setMessage('');
    setError('');
    try {
      await addNote.mutateAsync(trimmed);
      setNote('');
      setMessage('Note added to the application timeline.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add the note');
    }
  };

  const changeStatus = async (status: ApplicationStatus) => {
    setMessage('');
    setError('');
    try {
      await update.mutateAsync(status);
      setMessage(`Application moved to ${status}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the application');
    }
  };

  const deleteApplication = async () => {
    if (!window.confirm('Delete this tracked application? Its monthly quota usage will not be restored.')) {
      return;
    }
    setError('');
    try {
      await remove.mutateAsync();
      router.replace('/applications');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the application');
    }
  };

  if (application.isLoading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (application.isError || !application.data) {
    return (
      <Card>
        <p className="text-sm text-danger-700">
          {application.error?.message || 'Application not found.'}
        </p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/applications">Back to applications</Link>
        </Button>
      </Card>
    );
  }

  const item = application.data;
  const availableStatuses = nextStatuses[item.status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/applications" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            Applications
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">{item.job.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {item.job.company?.name || 'Company not listed'}
            {item.job.location ? ` · ${item.job.location}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={variants[item.status]}>{item.status}</Badge>
          {item.job.sourceUrl && (
            <Button asChild variant="secondary" size="sm">
              <a href={item.job.sourceUrl} target="_blank" rel="noreferrer">
                Original job
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={remove.isPending}
            onClick={() => void deleteApplication()}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {message && <div role="status" className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700">{message}</div>}
      {error && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Activity timeline</h2>
              <p className="mt-1 text-sm text-gray-500">Status changes and your private notes stay together.</p>
            </div>
            {availableStatuses.length > 0 && (
              <select
                aria-label="Move application to another status"
                defaultValue=""
                disabled={update.isPending}
                onChange={(event) => {
                  const status = event.target.value as ApplicationStatus;
                  if (status) void changeStatus(status);
                  event.currentTarget.value = '';
                }}
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="" disabled>Move to…</option>
                {availableStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            )}
          </div>

          <form onSubmit={submitNote} className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <label htmlFor="application-note" className="text-sm font-medium text-gray-800">Add a private note</label>
            <textarea
              id="application-note"
              value={note}
              maxLength={2_000}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Interview preparation, follow-up date, recruiter details…"
              className="mt-2 w-full resize-y rounded-lg border border-gray-300 bg-white p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400">{note.length}/2000</span>
              <Button type="submit" size="sm" disabled={!note.trim() || addNote.isPending}>
                {addNote.isPending ? 'Adding…' : 'Add note'}
              </Button>
            </div>
          </form>

          <ol className="mt-7 space-y-0">
            {timeline.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`} className="relative grid grid-cols-[20px_1fr] gap-3 pb-6 last:pb-0">
                {index < timeline.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-gray-200" />}
                <span className={`relative mt-1 h-5 w-5 rounded-full border-4 border-white ${entry.type === 'note' ? 'bg-amber-400' : 'bg-primary-500'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {entry.type === 'note'
                      ? 'Private note'
                      : entry.status
                        ? `Status changed to ${entry.status}`
                        : 'Application activity'}
                  </p>
                  {entry.note && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600">{entry.note}</p>}
                  <time className="mt-1 block text-xs text-gray-400">
                    {new Date(entry.timestamp).toLocaleString()}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-gray-900">Application details</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="mt-1 font-medium text-gray-900">{new Date(item.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Applied</dt>
                <dd className="mt-1 font-medium text-gray-900">
                  {item.appliedAt ? new Date(item.appliedAt).toLocaleString() : 'Not submitted yet'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Resume version</dt>
                <dd className="mt-1 font-medium text-gray-900">
                  {item.resumeVersion
                    ? `Saved ${new Date(item.resumeVersion.generatedAt).toLocaleDateString()}${item.resumeVersion.matchScore !== null ? ` · ${Math.round(item.resumeVersion.matchScore)}% match` : ''}`
                    : 'No resume version attached'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-gray-900">Cover letter</h2>
            {item.coverLetter ? (
              <>
                <p className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-gray-600">
                  {item.coverLetter.content}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => void navigator.clipboard.writeText(item.coverLetter?.content ?? '')}
                >
                  Copy cover letter
                </Button>
              </>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No cover letter attached to this application.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

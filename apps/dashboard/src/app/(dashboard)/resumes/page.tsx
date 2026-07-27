'use client';

import Link from 'next/link';
import { ChangeEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useResumes } from '@/lib/api/hooks/use-resumes';

export default function ResumesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const { resumes, upload, remove } = useResumes();

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      await upload.mutateAsync(file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this resume? This cannot be undone.')) return;
    setError('');
    try {
      await remove.mutateAsync(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resumes</h1>
          <p className="mt-1 text-sm text-gray-500">Upload PDF or DOCX files up to 5 MB.</p>
        </div>
        <input ref={inputRef} className="hidden" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile} />
        <Button onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? 'Uploading…' : 'Upload resume'}
        </Button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}

      {resumes.isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
      {resumes.isError && <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{resumes.error.message}</div>}
      {!resumes.isLoading && !resumes.data?.length && (
        <Card className="py-14 text-center">
          <h2 className="font-semibold text-gray-900">No resumes yet</h2>
          <p className="mt-2 text-sm text-gray-500">Upload a resume to begin matching it with jobs.</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {resumes.data?.map((resume) => (
          <Card key={resume.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">PDF</div>
              <Badge variant={resume.parseStatus === 'ready' ? 'success' : resume.parseStatus === 'failed' ? 'danger' : 'warning'}>
                {resume.parseStatus === 'ready' ? 'Ready' : resume.parseStatus === 'failed' ? 'Failed' : 'Processing'}
              </Badge>
            </div>
            <Link href={`/resumes/${resume.id}`} className="mt-4 block truncate font-semibold text-gray-900 hover:text-primary-600">
              {resume.fileName || 'Untitled resume'}
            </Link>
            <p className="mt-1 text-sm text-gray-500">
              {resume.fileSize ? `${(resume.fileSize / 1024 / 1024).toFixed(1)} MB · ` : ''}
              {new Date(resume.createdAt).toLocaleDateString()}
            </p>
            {resume.parseStatus === 'failed' && resume.parseError && (
              <p className="mt-2 text-xs text-danger-600">{resume.parseError}</p>
            )}
            <div className="mt-5 flex gap-2">
              {resume.parseStatus === 'ready' ? (
                <Link
                  href={`/jobs?resumeId=${encodeURIComponent(resume.id)}`}
                  className="inline-flex h-8 flex-1 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-600"
                >
                  Find matching jobs
                </Link>
              ) : (
                <Link href={`/resumes/${resume.id}`} className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">View</Link>
              )}
              {resume.parseStatus === 'ready' && (
                <Link href={`/resumes/${resume.id}`} className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">View</Link>
              )}
              <Button variant="danger" size="sm" onClick={() => void handleDelete(resume.id)} disabled={remove.isPending}>Delete</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

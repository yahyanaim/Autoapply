'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { JobSearchParams, RemoteType, useJobs } from '@/lib/api/hooks/use-jobs';
import { useApplications } from '@/lib/api/hooks/use-applications';
import { useResumes } from '@/lib/api/hooks/use-resumes';
import { hasMinimumPlan, useSubscription } from '@/lib/api/hooks/use-subscription';
import { apiClient } from '@/lib/api/api-client';

const remoteTypes: Array<{ label: string; value?: RemoteType }> = [
  { label: 'All' },
  { label: 'Remote', value: 'remote' },
  { label: 'Hybrid', value: 'hybrid' },
  { label: 'On-site', value: 'onsite' },
];

export default function JobsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [remoteType, setRemoteType] = useState<RemoteType | undefined>();
  const [filters, setFilters] = useState<JobSearchParams>({ limit: 20 });
  const [message, setMessage] = useState('');
  const jobs = useJobs(filters);
  const { prepare } = useApplications({ limit: 1 });
  const { resumes } = useResumes();
  const subscription = useSubscription();
  const hasPro = hasMinimumPlan(subscription.data, 'pro');
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [preparingJobId, setPreparingJobId] = useState('');
  const [captureUrl, setCaptureUrl] = useState('');
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureCompany, setCaptureCompany] = useState('');
  const [captureDescription, setCaptureDescription] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const readyResumes = useMemo(
    () =>
      resumes.data?.filter((resume) => resume.parseStatus === 'ready') ?? [],
    [resumes.data],
  );

  useEffect(() => {
    if (
      selectedResumeId &&
      readyResumes.some((resume) => resume.id === selectedResumeId)
    ) {
      return;
    }
    setSelectedResumeId(
      readyResumes.find((resume) => resume.isPrimary)?.id ??
        readyResumes[0]?.id ??
        '',
    );
  }, [readyResumes, selectedResumeId]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setFilters({ query: query.trim() || undefined, location: location.trim() || undefined, remoteType, limit: 20 });
  };

  const prepareApplication = async (jobId: string) => {
    if (!selectedResumeId) {
      setMessage('Choose a ready resume before preparing the application.');
      return;
    }
    setPreparingJobId(jobId);
    setMessage('');
    try {
      const application = await prepare.mutateAsync({
        jobId,
        resumeId: selectedResumeId,
      });
      router.push(`/applications/${application.id}`);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : 'Could not prepare the application',
      );
    } finally {
      setPreparingJobId('');
    }
  };

  const captureAndPrepare = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedResumeId) {
      setMessage('Choose a ready resume before preparing the application.');
      return;
    }
    setIsCapturing(true);
    setMessage('');
    try {
      const job = await apiClient.post<{ id: string }>('/jobs/capture', {
        sourceUrl: captureUrl.trim(),
        title: captureTitle.trim(),
        companyName: captureCompany.trim() || undefined,
        description: captureDescription.trim(),
        source: 'manual-capture',
      });
      const application = await prepare.mutateAsync({
        jobId: job.id,
        resumeId: selectedResumeId,
      });
      router.push(`/applications/${application.id}`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not capture the job');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Find jobs</h1><p className="mt-1 text-sm text-gray-500">Search the jobs currently indexed by ApplyAI.</p></div>

      <Card>
        <form onSubmit={search} className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2"><Input aria-label="Job search" placeholder="Title or keywords" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <Input aria-label="Location" placeholder="Location" value={location} onChange={(event) => setLocation(event.target.value)} />
          <Button type="submit">Search jobs</Button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {remoteTypes.map((type) => (
            <button key={type.label} type="button" onClick={() => setRemoteType(type.value)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${remoteType === type.value ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{type.label}</button>
          ))}
        </div>
        {hasPro ? (
          <div className="mt-4 max-w-md">
            <label htmlFor="cover-letter-resume" className="block text-sm font-medium text-gray-700">
              Resume for the application package
            </label>
            <select
              id="cover-letter-resume"
              value={selectedResumeId}
              onChange={(event) => setSelectedResumeId(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="">Choose a ready resume…</option>
              {readyResumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.fileName || 'Untitled resume'}
                  {resume.isPrimary ? ' (primary)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            Unified CV optimization and cover-letter preparation are available on Pro.{' '}
            <a href="/billing" className="font-semibold text-primary-600 hover:text-primary-700">View plans</a>
          </p>
        )}
      </Card>

      <details className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">
          Job not indexed? Paste it and prepare the complete application
        </summary>
        <form onSubmit={captureAndPrepare} className="mt-5 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              aria-label="Original job URL"
              type="url"
              required
              placeholder="https://example.com/job/..."
              value={captureUrl}
              onChange={(event) => setCaptureUrl(event.target.value)}
            />
            <Input
              aria-label="Job title"
              required
              placeholder="Job title"
              value={captureTitle}
              onChange={(event) => setCaptureTitle(event.target.value)}
            />
          </div>
          <Input
            aria-label="Company name"
            placeholder="Company name"
            value={captureCompany}
            onChange={(event) => setCaptureCompany(event.target.value)}
          />
          <textarea
            aria-label="Job description"
            required
            minLength={20}
            rows={8}
            placeholder="Paste the complete job description here…"
            value={captureDescription}
            onChange={(event) => setCaptureDescription(event.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white p-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <Button
            type="submit"
            disabled={!hasPro || !selectedResumeId || isCapturing}
            className="w-full md:w-fit"
          >
            {isCapturing ? 'Preparing CV + letter…' : 'Capture and prepare application'}
          </Button>
        </form>
      </details>

      {message && <div role="status" className="rounded-lg border border-info-200 bg-info-50 p-3 text-sm text-info-700">{message}</div>}
      {jobs.isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
      {jobs.isError && <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">{jobs.error.message}</div>}
      {!jobs.isLoading && !jobs.data?.jobs.length && <Card className="py-14 text-center text-sm text-gray-500">No jobs match these filters.</Card>}

      {jobs.data && <p className="text-sm text-gray-500">{jobs.data.total} job{jobs.data.total === 1 ? '' : 's'} found</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {jobs.data?.jobs.map((job) => {
          const salary = job.salaryMin || job.salaryMax
            ? [job.salaryMin, job.salaryMax].filter(Boolean).map((value) => `$${Number(value).toLocaleString()}`).join(' – ')
            : 'Salary not listed';
          return (
            <Card key={job.id}>
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="font-semibold text-gray-900">{job.title}</h2><p className="mt-1 text-sm text-gray-600">{job.company?.name || 'Company not listed'}</p></div>
                {job.remoteType && <Badge variant={job.remoteType === 'remote' ? 'success' : job.remoteType === 'hybrid' ? 'info' : 'warning'}>{job.remoteType === 'onsite' ? 'on-site' : job.remoteType}</Badge>}
              </div>
              <p className="mt-4 text-sm text-gray-500">{job.location || 'Location not listed'} · {salary}</p>
              {job.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{job.skills.slice(0, 6).map((skill) => <span key={skill.id} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{skill.name}</span>)}</div>}
              <p className="mt-3 line-clamp-3 text-sm text-gray-600">{job.description || 'No description available.'}</p>
              <div className="mt-5 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void prepareApplication(job.id)}
                  disabled={!hasPro || !selectedResumeId || preparingJobId === job.id}
                >
                  {preparingJobId === job.id
                    ? 'Preparing CV + letter…'
                    : hasPro
                      ? 'Prepare application'
                      : 'Prepare application · Pro'}
                </Button>
                {job.sourceUrl && <a className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50" href={job.sourceUrl} target="_blank" rel="noreferrer">View source</a>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

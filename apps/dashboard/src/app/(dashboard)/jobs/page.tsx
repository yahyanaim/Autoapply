'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { MatchScore } from '@/components/ui/MatchScore';
import {
  JobRecommendation,
  JobSearchParams,
  RemoteType,
  useJobDiscovery,
  useJobs,
} from '@/lib/api/hooks/use-jobs';
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

function getJobActionLabel(options: {
  isPlanReady: boolean;
  hasPro: boolean;
  isPreparing: boolean;
  isTracked: boolean;
  isRecommendation: boolean;
  isSelected: boolean;
}): string {
  if (!options.isPlanReady) return 'Checking plan…';
  if (options.isPreparing) {
    return options.hasPro ? 'Preparing CV + letter…' : 'Optimizing CV…';
  }
  if (options.hasPro && options.isTracked) return 'Already in tracker';
  if (options.isRecommendation && !options.isSelected) return 'Select this job';
  if (!options.hasPro) return 'Optimize CV · 1 free/month';
  return options.isRecommendation
    ? 'Prepare selected job'
    : 'Prepare application';
}

export default function JobsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [remoteType, setRemoteType] = useState<RemoteType | undefined>();
  const [filters, setFilters] = useState<JobSearchParams>({ limit: 20 });
  const [message, setMessage] = useState('');
  const jobs = useJobs(filters);
  const discovery = useJobDiscovery();
  const discoveredResumeId = discovery.data?.resumeId;
  const resetDiscovery = discovery.reset;
  const { prepare } = useApplications({ limit: 1 });
  const { resumes, optimize } = useResumes();
  const subscription = useSubscription();
  const isPlanReady = subscription.isSuccess;
  const hasPro = hasMinimumPlan(subscription.data, 'pro');
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
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

  useEffect(() => {
    const requestedResumeId = new URLSearchParams(window.location.search).get(
      'resumeId',
    );
    if (
      requestedResumeId &&
      readyResumes.some((resume) => resume.id === requestedResumeId)
    ) {
      setSelectedResumeId(requestedResumeId);
    }
  }, [readyResumes]);

  useEffect(() => {
    if (
      discoveredResumeId &&
      discoveredResumeId !== selectedResumeId
    ) {
      resetDiscovery();
      setSelectedJobId('');
    }
  }, [discoveredResumeId, resetDiscovery, selectedResumeId]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    discovery.reset();
    setSelectedJobId('');
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

  const optimizeResumeForJob = async (jobId: string) => {
    if (!selectedResumeId) {
      setMessage('Choose a ready resume before optimizing it.');
      return;
    }
    setPreparingJobId(jobId);
    setMessage('');
    try {
      await optimize.mutateAsync({
        jobId,
        resumeId: selectedResumeId,
      });
      router.push(`/resumes/${selectedResumeId}`);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : 'Could not optimize the CV',
      );
    } finally {
      setPreparingJobId('');
    }
  };

  const discoverMatches = async () => {
    if (!selectedResumeId) {
      setMessage('Choose a ready resume before discovering matching jobs.');
      return;
    }
    setMessage('');
    setSelectedJobId('');
    try {
      const result = await discovery.mutateAsync({
        resumeId: selectedResumeId,
        query: query.trim() || undefined,
        location: location.trim() || undefined,
        remoteType,
        limit: 20,
      });
      if (!result.jobs.length) {
        setMessage(
          'No scored jobs are available yet. Try broader filters or ask the platform administrator to configure approved job sources.',
        );
      }
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'Could not discover matching jobs',
      );
    }
  };

  const captureAndPrepare = async (event: FormEvent) => {
    event.preventDefault();
    if (!isPlanReady) {
      setMessage('Your plan details are still loading. Please try again.');
      return;
    }
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
      if (hasPro) {
        const application = await prepare.mutateAsync({
          jobId: job.id,
          resumeId: selectedResumeId,
        });
        router.push(`/applications/${application.id}`);
      } else {
        await optimize.mutateAsync({
          jobId: job.id,
          resumeId: selectedResumeId,
        });
        router.push(`/resumes/${selectedResumeId}`);
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not capture the job');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Find jobs</h1><p className="mt-1 text-sm text-gray-500">Discover up to 20 explainable matches from approved job sources, then select one to prepare.</p></div>

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
        <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-md flex-1">
            <label htmlFor="cover-letter-resume" className="block text-sm font-medium text-gray-700">
              Resume used for discovery and the application package
            </label>
            <select
              id="cover-letter-resume"
              value={selectedResumeId}
              onChange={(event) => {
                setSelectedResumeId(event.target.value);
                setSelectedJobId('');
                discovery.reset();
              }}
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
          <Button
            type="button"
            onClick={() => void discoverMatches()}
            disabled={!selectedResumeId || discovery.isPending}
          >
            {discovery.isPending
              ? 'Finding and scoring jobs…'
              : 'Find my 20 best matches'}
          </Button>
        </div>
        {isPlanReady && !hasPro && (
          <p className="mt-4 text-sm text-gray-500">
            Free includes 3 discovery runs, 5 AI requests, and 1 CV
            optimization per month. Pro includes 50 discovery runs plus
            unlimited CV optimization and unified cover-letter preparation.{' '}
            <a href="/billing" className="font-semibold text-primary-600 hover:text-primary-700">View plans</a>
          </p>
        )}
      </Card>

      {discovery.isError && (
        <div
          role="alert"
          className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700"
        >
          {discovery.error.message}
        </div>
      )}

      {discovery.data && (
        <Card className="border-primary-200 bg-primary-50/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge variant="info">CV-matched discovery</Badge>
              <h2 className="mt-3 text-lg font-semibold text-gray-900">
                {discovery.data.jobs.length} of your best available matches
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">
                Ranked from {discovery.data.totalCandidates} eligible jobs using
                the selected CV. Scores explain alignment; they do not guarantee
                an interview.
              </p>
              <p className="mt-2 text-xs font-medium text-gray-500">
                {discovery.data.discoveryUsage.unlimited
                  ? 'Unlimited discovery runs on your current plan'
                  : `${discovery.data.discoveryUsage.used} of ${discovery.data.discoveryUsage.maximum} monthly discovery runs used · ${discovery.data.discoveryUsage.remaining} remaining`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                discovery.reset();
                setSelectedJobId('');
              }}
              className="text-sm font-semibold text-primary-700 hover:text-primary-800"
            >
              Return to normal search
            </button>
          </div>
          {(discovery.data.searchProfile.roles.length > 0 ||
            discovery.data.searchProfile.skills.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {discovery.data.searchProfile.roles.map((role) => (
                <Badge key={`role-${role}`} variant="outline">
                  {role}
                </Badge>
              ))}
              {discovery.data.searchProfile.skills.slice(0, 8).map((skill) => (
                <Badge key={`skill-${skill}`} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          )}
          {discovery.data.jobs.length < discovery.data.requestedLimit && (
            <p className="mt-4 rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs text-warning-700">
              Fewer than 20 complete listings are currently available. ApplyAI
              does not fabricate missing jobs; configure more approved ATS
              boards or capture additional listings with the extension.
            </p>
          )}
        </Card>
      )}

      <details className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">
          Job not indexed? Paste it and{' '}
          {!isPlanReady
            ? 'continue after your plan loads'
            : hasPro
              ? 'prepare the complete application'
              : 'optimize your CV'}
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
            disabled={!isPlanReady || !selectedResumeId || isCapturing}
            className="w-full md:w-fit"
          >
            {isCapturing
              ? hasPro
                ? 'Preparing CV + letter…'
                : 'Optimizing CV…'
              : hasPro
                ? 'Capture and prepare application'
                : 'Capture and use free CV optimization'}
          </Button>
        </form>
      </details>

      {message && <div role="status" className="rounded-lg border border-info-200 bg-info-50 p-3 text-sm text-info-700">{message}</div>}
      {!discovery.data && jobs.isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
      {!discovery.data && jobs.isError && <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">{jobs.error.message}</div>}
      {!discovery.data && !jobs.isLoading && !jobs.data?.jobs.length && <Card className="py-14 text-center text-sm text-gray-500">No jobs match these filters.</Card>}

      {!discovery.data && jobs.data && <p className="text-sm text-gray-500">{jobs.data.total} job{jobs.data.total === 1 ? '' : 's'} found</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(discovery.data?.jobs ?? jobs.data?.jobs ?? []).map((job) => {
          const recommendation =
            'matchScore' in job ? (job as JobRecommendation) : null;
          const isSelected = selectedJobId === job.id;
          const actionLabel = getJobActionLabel({
            isPlanReady,
            hasPro,
            isPreparing: preparingJobId === job.id,
            isTracked: Boolean(recommendation?.trackedApplication),
            isRecommendation: Boolean(recommendation),
            isSelected,
          });
          const salary = job.salaryMin || job.salaryMax
            ? [job.salaryMin, job.salaryMax].filter(Boolean).map((value) => `$${Number(value).toLocaleString()}`).join(' – ')
            : 'Salary not listed';
          return (
            <Card
              key={job.id}
              className={
                isSelected
                  ? 'border-primary-400 ring-2 ring-primary-100'
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="font-semibold text-gray-900">{job.title}</h2><p className="mt-1 text-sm text-gray-600">{job.company?.name || 'Company not listed'}</p></div>
                {recommendation ? (
                  <div className="text-center">
                    <MatchScore score={recommendation.matchScore} size="lg" />
                    <p className="mt-1 text-[11px] font-medium text-gray-500">
                      CV match
                    </p>
                  </div>
                ) : job.remoteType ? (
                  <Badge variant={job.remoteType === 'remote' ? 'success' : job.remoteType === 'hybrid' ? 'info' : 'warning'}>{job.remoteType === 'onsite' ? 'on-site' : job.remoteType}</Badge>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span>{job.location || 'Location not listed'} · {salary}</span>
                {job.remoteType && (
                  <Badge variant={job.remoteType === 'remote' ? 'success' : job.remoteType === 'hybrid' ? 'info' : 'warning'}>{job.remoteType === 'onsite' ? 'on-site' : job.remoteType}</Badge>
                )}
              </div>
              {job.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{job.skills.slice(0, 6).map((skill) => <span key={skill.id} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{skill.name}</span>)}</div>}
              <p className="mt-3 line-clamp-3 text-sm text-gray-600">{job.description || 'No description available.'}</p>
              {recommendation && (
                <details className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  <summary className="cursor-pointer font-semibold text-gray-800">
                    Why this score?
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {recommendation.explanation.slice(0, 5).map((line) => (
                      <li key={line}>• {line}</li>
                    ))}
                  </ul>
                  {recommendation.matchedResumeSkills.length > 0 && (
                    <p className="mt-2">
                      <span className="font-semibold">Matched CV skills:</span>{' '}
                      {recommendation.matchedResumeSkills.join(', ')}
                    </p>
                  )}
                  {recommendation.missingKeywords.length > 0 && (
                    <p className="mt-2">
                      <span className="font-semibold">Missing keywords:</span>{' '}
                      {recommendation.missingKeywords.join(', ')}
                    </p>
                  )}
                </details>
              )}
              <div className="mt-5 flex gap-2">
                <Button
                  size="sm"
                  variant={recommendation && !isSelected ? 'outline' : 'default'}
                  onClick={() => {
                    if (recommendation && !isSelected) {
                      setSelectedJobId(job.id);
                      return;
                    }
                    if (hasPro) {
                      void prepareApplication(job.id);
                    } else {
                      void optimizeResumeForJob(job.id);
                    }
                  }}
                  disabled={
                    !isPlanReady ||
                    !selectedResumeId ||
                    preparingJobId === job.id ||
                    (hasPro && Boolean(recommendation?.trackedApplication))
                  }
                >
                  {actionLabel}
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

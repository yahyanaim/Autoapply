'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MatchScore } from '@/components/ui/MatchScore';
import { Spinner } from '@/components/ui/Spinner';
import {
  OptimizeResult,
  useResume,
  useResumes,
  useResumeVersions,
} from '@/lib/api/hooks/use-resumes';
import { useJobs } from '@/lib/api/hooks/use-jobs';
import { hasMinimumPlan, useSubscription } from '@/lib/api/hooks/use-subscription';
import Link from 'next/link';
import { ClassicResumePreview } from '@/components/resumes/ClassicResumePreview';

export default function ResumeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const resume = useResume(id);
  const { optimize } = useResumes();
  const { versions, downloadPdf } = useResumeVersions(id);
  const jobs = useJobs({ limit: 100 });
  const subscription = useSubscription();
  const hasPro = hasMinimumPlan(subscription.data, 'pro');
  const [jobId, setJobId] = useState('');
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState('');

  const handleOptimize = async () => {
    if (!jobId.trim()) return setError('Enter a job ID first.');
    setError('');
    try {
      setResult(await optimize.mutateAsync({ resumeId: id, jobId: jobId.trim() }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Optimization failed');
    }
  };

  const handleDownload = async (versionId: string) => {
    setError('');
    try {
      const blob = await downloadPdf.mutateAsync(versionId);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      const originalName = resume.data?.fileName?.replace(/\.(pdf|docx)$/i, '') || 'resume';
      anchor.href = url;
      anchor.download = `${originalName}-optimized.pdf`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PDF download failed');
    }
  };

  if (resume.isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (resume.isError || !resume.data) return <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">{resume.error?.message || 'Resume not found'}</div>;

  const latestGeneratedVersion = versions.data?.find((version) => version.documentJson);
  const previewDocument = result?.document ?? latestGeneratedVersion?.documentJson ?? null;
  const previewVersionId = result?.versionId ?? latestGeneratedVersion?.id ?? null;

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => router.back()} className="mb-2 text-sm text-gray-500 hover:text-gray-700">← Back to resumes</button>
        <h1 className="text-2xl font-bold text-gray-900">{resume.data.fileName || 'Untitled resume'}</h1>
        <p className="mt-1 text-sm text-gray-500">Uploaded {new Date(resume.data.createdAt).toLocaleString()}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="font-semibold text-gray-900">Parsed content</h2>
          {resume.data.parsedJson ? (
            <pre className="mt-4 max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-xs text-gray-700">{JSON.stringify(resume.data.parsedJson, null, 2)}</pre>
          ) : resume.data.parseStatus === 'failed' ? (
            <p className="mt-4 text-sm text-danger-600">{resume.data.parseError || 'Resume parsing failed.'}</p>
          ) : (
            <p className="mt-4 text-sm text-gray-500">The background parser is still processing this file. Refresh shortly.</p>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold text-gray-900">Optimize for a job</h2>
            <p className="mt-1 text-xs text-gray-500">
              {hasPro
                ? 'Choose a saved job to tailor this resume with fabrication checks.'
                : 'Resume optimization with fabrication checks is available on Pro.'}
            </p>
            <div className="mt-4 space-y-3">
              <select aria-label="Job to optimize for" value={jobId} onChange={(event) => setJobId(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900">
                <option value="">Select a job…</option>
                {jobs.data?.jobs.map((job) => <option key={job.id} value={job.id}>{job.title} — {job.company?.name || 'Company not listed'}</option>)}
              </select>
              {hasPro ? (
                <Button className="w-full" onClick={() => void handleOptimize()} disabled={optimize.isPending || resume.data.parseStatus !== 'ready'}>
                  {optimize.isPending ? 'Optimizing…' : 'Optimize with AI'}
                </Button>
              ) : (
                <Button asChild className="w-full">
                  <Link href="/billing">Upgrade to Pro</Link>
                </Button>
              )}
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-danger-600">{error}</p>}
          </Card>

          {result && (
            <Card>
              <div className="flex items-center justify-between"><h2 className="font-semibold text-gray-900">Result</h2><MatchScore score={result.matchScore} size="sm" /></div>
              <p className="mt-3 text-xs font-medium text-gray-700">Missing keywords</p>
              <p className="mt-1 text-sm text-gray-600">{result.missingKeywords.join(', ') || 'None'}</p>
              <Button
                className="mt-4 w-full"
                onClick={() => void handleDownload(result.versionId)}
                disabled={downloadPdf.isPending}
              >
                {downloadPdf.isPending ? 'Preparing PDF…' : 'Download formatted CV'}
              </Button>
              <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-primary-600">View optimized text</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{result.optimizedText}</pre></details>
            </Card>
          )}

          {!result && latestGeneratedVersion && (
            <Card>
              <h2 className="font-semibold text-gray-900">Latest generated CV</h2>
              <p className="mt-1 text-xs text-gray-500">
                Created {new Date(latestGeneratedVersion.generatedAt).toLocaleString()}
              </p>
              {latestGeneratedVersion.matchScore !== null && (
                <div className="mt-3">
                  <MatchScore score={latestGeneratedVersion.matchScore} size="sm" />
                </div>
              )}
              <Button
                className="mt-4 w-full"
                onClick={() => void handleDownload(latestGeneratedVersion.id)}
                disabled={downloadPdf.isPending}
              >
                {downloadPdf.isPending ? 'Preparing PDF…' : 'Download PDF'}
              </Button>
            </Card>
          )}
        </div>
      </div>

      {previewDocument && previewVersionId && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
                Generated CV
              </p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900">
                Classic ATS template
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                The AI rewrites only supported content. ApplyAI keeps verified roles,
                employers, dates, education, skills, and your profile contact details.
              </p>
            </div>
            <Button
              onClick={() => void handleDownload(previewVersionId)}
              disabled={downloadPdf.isPending}
            >
              {downloadPdf.isPending ? 'Preparing PDF…' : 'Download this CV'}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-[#eceae6] p-3 sm:p-8">
            <ClassicResumePreview document={previewDocument} />
          </div>
        </section>
      )}
    </div>
  );
}

'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MatchScore } from '@/components/ui/MatchScore';
import { Spinner } from '@/components/ui/Spinner';
import { ClassicResumePreview } from '@/components/resumes/ClassicResumePreview';
import { TruthfulnessReview } from '@/components/resumes/TruthfulnessReview';
import { CoverLetterReview } from '@/components/applications/CoverLetterReview';
import {
  ApplicationPreparationStatus,
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

const statusVariants: Record<
  ApplicationStatus,
  'info' | 'warning' | 'success' | 'danger'
> = {
  draft: 'info',
  submitted: 'info',
  viewed: 'warning',
  interview: 'warning',
  offer: 'success',
  rejected: 'danger',
};

const preparationLabels: Record<ApplicationPreparationStatus, string> = {
  job_captured: 'Job captured',
  analyzing: 'Analyzing job',
  generating: 'Generating materials',
  ready_for_review: 'Ready for review',
  ready_to_submit: 'Approved · ready to submit',
  generation_failed: 'Preparation failed',
};

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const {
    application,
    addNote,
    update,
    updateMaterials,
    regenerate,
    approve,
    downloadPdf,
    remove,
  } = useApplication(id);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [experience, setExperience] = useState<
    Array<{ description: string; highlights: string }>
  >([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [confirmQuestionableClaims, setConfirmQuestionableClaims] =
    useState(false);

  const document = application.data?.resumeVersion?.documentJson;
  useEffect(() => {
    if (!document) return;
    setProfile(document.profile);
    setExperience(
      document.experience.map((item) => ({
        description: item.description,
        highlights: item.highlights.join('\n'),
      })),
    );
    setProjects(document.projects.map((item) => item.description));
    setCoverLetter(application.data?.coverLetter?.content ?? '');
    setConfirmQuestionableClaims(false);
  }, [document, application.data?.coverLetter?.content]);

  const timeline = useMemo(
    () =>
      [...(application.data?.timeline ?? [])].sort(
        (left, right) =>
          new Date(right.timestamp).getTime() -
          new Date(left.timestamp).getTime(),
      ),
    [application.data?.timeline],
  );

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Action failed');
    }
  };

  const saveMaterials = () => {
    setConfirmQuestionableClaims(false);
    return runAction(
      () =>
        updateMaterials.mutateAsync({
          profile,
          experience: experience.map((item, index) => ({
            index,
            description: item.description,
            highlights: item.highlights
              .split('\n')
              .map((value) => value.trim())
              .filter(Boolean),
          })),
          projects: projects.map((description, index) => ({
            index,
            description,
          })),
          coverLetter,
        }),
      'Changes saved. Review the updated package before approval.',
    );
  };

  const downloadResume = async () => {
    const version = application.data?.resumeVersion;
    if (!version) return;
    setError('');
    try {
      const blob = await downloadPdf.mutateAsync({
        resumeId: version.resumeId,
        versionId: version.id,
      });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `${application.data?.job.title || 'optimized'}-cv.pdf`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'PDF download failed',
      );
    }
  };

  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) return;
    await runAction(async () => {
      await addNote.mutateAsync(trimmed);
      setNote('');
    }, 'Note added.');
  };

  const deleteApplication = async () => {
    if (!window.confirm('Delete this application workflow?')) return;
    await runAction(async () => {
      await remove.mutateAsync();
      router.replace('/applications');
    }, 'Application deleted.');
  };

  if (application.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
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
  const isReviewable =
    item.preparationStatus === 'ready_for_review' ||
    item.preparationStatus === 'ready_to_submit';
  const isBusy =
    item.preparationStatus === 'analyzing' ||
    item.preparationStatus === 'generating';
  const canSubmit =
    item.status === 'draft' &&
    (!item.resumeVersionId || item.preparationStatus === 'ready_to_submit');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/applications"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Applications
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">
            {item.job.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {item.job.company?.name || 'Company not listed'}
            {item.job.location ? ` · ${item.job.location}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariants[item.status]}>{item.status}</Badge>
          <Badge
            variant={
              item.preparationStatus === 'ready_to_submit'
                ? 'success'
                : item.preparationStatus === 'generation_failed'
                  ? 'danger'
                  : 'info'
            }
          >
            {preparationLabels[item.preparationStatus]}
          </Badge>
          {item.job.sourceUrl && (
            <Button asChild variant="secondary" size="sm">
              <a href={item.job.sourceUrl} target="_blank" rel="noreferrer">
                Original job <ExternalLink className="h-4 w-4" />
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
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <WorkflowProgress status={item.preparationStatus} />

      {message && (
        <div
          role="status"
          className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700"
        >
          {message}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
        >
          {error}
        </div>
      )}

      {isBusy && (
        <Card className="flex items-center gap-4 py-10">
          <Spinner size="lg" />
          <div>
            <h2 className="font-semibold text-gray-900">
              {item.preparationStatus === 'analyzing'
                ? 'Analyzing the job requirements'
                : 'Generating your CV and cover letter'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              ApplyAI is preparing one grounded application package.
            </p>
          </div>
        </Card>
      )}

      {item.preparationStatus === 'generation_failed' && (
        <Card>
          <h2 className="font-semibold text-danger-700">Preparation failed</h2>
          <p className="mt-2 text-sm text-gray-600">
            {item.generationError || 'The materials could not be generated.'}
          </p>
          <Button
            className="mt-4"
            disabled={regenerate.isPending}
            onClick={() =>
              void runAction(
                () => regenerate.mutateAsync('all'),
                'Application package regenerated.',
              )
            }
          >
            <RefreshCw className="h-4 w-4" />
            Retry preparation
          </Button>
        </Card>
      )}

      {isReviewable && document && item.coverLetter && (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
                    Job technical sheet
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-gray-900">
                    What this role requires
                  </h2>
                </div>
                {item.resumeVersion?.matchScore !== null &&
                  item.resumeVersion?.matchScore !== undefined && (
                    <MatchScore
                      score={item.resumeVersion.matchScore}
                      size="sm"
                    />
                  )}
              </div>
              {item.jobAnalysis ? (
                <div className="mt-5 space-y-5">
                  <p className="text-sm leading-6 text-gray-600">
                    {item.jobAnalysis.summary}
                  </p>
                  <AnalysisList
                    title="Responsibilities"
                    values={item.jobAnalysis.responsibilities}
                  />
                  <AnalysisList
                    title="Required skills"
                    values={item.jobAnalysis.requiredSkills}
                  />
                  <AnalysisList
                    title="Preferred skills"
                    values={item.jobAnalysis.preferredSkills}
                  />
                  <AnalysisList
                    title="ATS keywords"
                    values={item.jobAnalysis.keywords}
                    compact
                  />
                </div>
              ) : (
                <p className="mt-4 text-sm text-gray-500">
                  Job analysis unavailable.
                </p>
              )}
            </Card>

            <Card>
              <h2 className="text-lg font-semibold text-gray-900">
                Package controls
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Save edits before approving. Approval freezes the exact CV and
                cover letter that the extension may use.
              </p>
              <div className="mt-5 grid gap-2">
                <Button
                  onClick={() => void saveMaterials()}
                  disabled={updateMaterials.isPending}
                >
                  <Save className="h-4 w-4" />
                  {updateMaterials.isPending ? 'Saving…' : 'Save all edits'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void downloadResume()}
                  disabled={downloadPdf.isPending}
                >
                  <Download className="h-4 w-4" />
                  {downloadPdf.isPending ? 'Preparing PDF…' : 'Download CV PDF'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={regenerate.isPending}
                  onClick={() =>
                    void runAction(
                      () => regenerate.mutateAsync('resume'),
                      'CV and connected cover letter regenerated.',
                    )
                  }
                >
                  <RefreshCw className="h-4 w-4" /> Regenerate CV + letter
                </Button>
                <Button
                  variant="secondary"
                  disabled={regenerate.isPending}
                  onClick={() =>
                    void runAction(
                      () => regenerate.mutateAsync('cover_letter'),
                      'Cover letter regenerated.',
                    )
                  }
                >
                  <RefreshCw className="h-4 w-4" /> Regenerate letter only
                </Button>
                {item.preparationStatus === 'ready_for_review' ? (
                  <>
                    {item.truthfulness?.status === 'review_required' && (
                      <label className="mt-2 flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm leading-5 text-warning-800">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-warning-400 text-primary-600"
                          checked={confirmQuestionableClaims}
                          onChange={(event) =>
                            setConfirmQuestionableClaims(event.target.checked)
                          }
                        />
                        I confirm that the highlighted wording accurately
                        describes my real experience.
                      </label>
                    )}
                    <Button
                      className="mt-2"
                      disabled={
                        approve.isPending ||
                        updateMaterials.isPending ||
                        item.truthfulness?.status === 'blocked' ||
                        (item.truthfulness?.status === 'review_required' &&
                          !confirmQuestionableClaims)
                      }
                      onClick={() =>
                        void runAction(
                          () => approve.mutateAsync(confirmQuestionableClaims),
                          'Package approved. It is ready for extension-assisted submission.',
                        )
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {approve.isPending
                        ? 'Approving…'
                        : item.truthfulness?.status === 'review_required'
                          ? 'Confirm claims and approve'
                          : 'Approve application package'}
                    </Button>
                  </>
                ) : (
                  <div className="mt-2 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700">
                    Approved{' '}
                    {item.approvedAt
                      ? new Date(item.approvedAt).toLocaleString()
                      : ''}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <TruthfulnessReview report={item.truthfulness} />

          <Card>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
              Optimized CV
            </p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900">
              Review and edit the generated content
            </h2>
            <div className="mt-6 grid gap-5">
              <label className="text-sm font-medium text-gray-800">
                Profile
                <textarea
                  value={profile}
                  onChange={(event) => setProfile(event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-gray-300 p-3 text-sm font-normal leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
              {document.experience.map((entry, index) => (
                <div
                  key={`${entry.company}-${index}`}
                  className="rounded-xl border border-gray-200 p-4"
                >
                  <h3 className="font-semibold text-gray-900">
                    {entry.title} · {entry.company}
                  </h3>
                  <label className="mt-4 block text-sm font-medium text-gray-700">
                    Description
                    <textarea
                      value={experience[index]?.description ?? ''}
                      onChange={(event) =>
                        setExperience((current) =>
                          current.map((value, position) =>
                            position === index
                              ? { ...value, description: event.target.value }
                              : value,
                          ),
                        )
                      }
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-normal leading-6"
                    />
                  </label>
                  <label className="mt-4 block text-sm font-medium text-gray-700">
                    Highlights · one per line
                    <textarea
                      value={experience[index]?.highlights ?? ''}
                      onChange={(event) =>
                        setExperience((current) =>
                          current.map((value, position) =>
                            position === index
                              ? { ...value, highlights: event.target.value }
                              : value,
                          ),
                        )
                      }
                      rows={4}
                      className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-normal leading-6"
                    />
                  </label>
                </div>
              ))}
              {document.projects.map((project, index) => (
                <label
                  key={`${project.name}-${index}`}
                  className="text-sm font-medium text-gray-800"
                >
                  Project · {project.name}
                  <textarea
                    value={projects[index] ?? ''}
                    onChange={(event) =>
                      setProjects((current) =>
                        current.map((value, position) =>
                          position === index ? event.target.value : value,
                        ),
                      )
                    }
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-normal leading-6"
                  />
                </label>
              ))}
            </div>
          </Card>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
                CV preview
              </p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900">
                Classic ATS template
              </h2>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-[#eceae6] p-3 sm:p-8">
              <ClassicResumePreview document={document} />
            </div>
          </section>

          <CoverLetterReview value={coverLetter} onChange={setCoverLetter} />
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.7fr)]">
        <Card>
          <h2 className="text-lg font-semibold text-gray-900">
            Activity timeline
          </h2>
          <form
            onSubmit={submitNote}
            className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4"
          >
            <textarea
              value={note}
              maxLength={2_000}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add a private note…"
              className="w-full resize-y rounded-lg border border-gray-300 bg-white p-3 text-sm"
            />
            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={!note.trim() || addNote.isPending}
              >
                Add note
              </Button>
            </div>
          </form>
          <ol className="mt-6 space-y-4">
            {timeline.map((entry, index) => (
              <li
                key={`${entry.timestamp}-${index}`}
                className="border-l-2 border-gray-200 pl-4"
              >
                <p className="text-sm font-medium text-gray-900">
                  {entry.note ||
                    (entry.status
                      ? `Status changed to ${entry.status}`
                      : 'Workflow activity')}
                </p>
                <time className="mt-1 block text-xs text-gray-400">
                  {new Date(entry.timestamp).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-gray-900">
            Submission status
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            ApplyAI can prepare and fill the approved package. You make the
            final decision and personally submit it.
          </p>
          {nextStatuses[item.status].length > 0 && (
            <select
              aria-label="Move application to another status"
              defaultValue=""
              disabled={update.isPending}
              onChange={(event) => {
                const status = event.target.value as ApplicationStatus;
                if (status) {
                  void runAction(
                    () => update.mutateAsync(status),
                    `Application moved to ${status}.`,
                  );
                }
                event.currentTarget.value = '';
              }}
              className="mt-5 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="" disabled>
                Move to…
              </option>
              {nextStatuses[item.status].map((status) => (
                <option
                  key={status}
                  value={status}
                  disabled={status === 'submitted' && !canSubmit}
                >
                  {status}
                </option>
              ))}
            </select>
          )}
          {!canSubmit && item.status === 'draft' && (
            <p className="mt-3 text-xs text-amber-700">
              Approve the package before marking it submitted.
            </p>
          )}
          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {new Date(item.createdAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Applied</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {item.appliedAt
                  ? new Date(item.appliedAt).toLocaleString()
                  : 'Not submitted yet'}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}

function WorkflowProgress({
  status,
}: {
  status: ApplicationPreparationStatus;
}) {
  const steps = [
    'Job captured',
    'Analyzed',
    'Materials generated',
    'User approved',
  ];
  const progress: Record<ApplicationPreparationStatus, number> = {
    job_captured: 1,
    analyzing: 1,
    generating: 2,
    ready_for_review: 3,
    ready_to_submit: 4,
    generation_failed: 1,
  };
  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {steps.map((step, index) => {
          const complete = index < progress[status];
          return (
            <div key={step} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${complete ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'}`}
              >
                {index + 1}
              </span>
              <span
                className={`text-xs font-medium ${complete ? 'text-gray-900' : 'text-gray-400'}`}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AnalysisList({
  title,
  values,
  compact = false,
}: {
  title: string;
  values: string[];
  compact?: boolean;
}) {
  if (!values.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {compact ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-700"
            >
              {value}
            </span>
          ))}
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {values.map((value) => (
            <li
              key={value}
              className="flex gap-2 text-sm leading-6 text-gray-600"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

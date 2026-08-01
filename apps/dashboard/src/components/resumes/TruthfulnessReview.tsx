import type {
  TruthfulnessFinding,
  TruthfulnessReport,
} from '@/lib/api/hooks/use-resumes';

interface TruthfulnessReviewProps {
  report: TruthfulnessReport | null | undefined;
}

const classificationLabels = {
  needs_confirmation: 'Confirm this wording',
  unsupported_blocked: 'Unsupported · blocked',
} as const;

export function TruthfulnessReview({ report }: TruthfulnessReviewProps) {
  if (!report) return null;

  const reviewFindings = report.findings.filter(
    (finding) =>
      finding.classification === 'needs_confirmation' ||
      finding.classification === 'unsupported_blocked',
  );
  const checkedCount = report.summary.supported + report.summary.safe_rewording;

  return (
    <section
      aria-label="CV truthfulness review"
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
            Truthfulness check
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">
            Every factual change is checked against the uploaded CV
          </h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            report.status === 'blocked'
              ? 'bg-danger-50 text-danger-700'
              : report.status === 'review_required'
                ? 'bg-warning-50 text-warning-700'
                : 'bg-success-50 text-success-700'
          }`}
        >
          {report.status === 'blocked'
            ? 'Unsupported claims blocked'
            : report.status === 'review_required'
              ? 'Your confirmation needed'
              : 'Grounded in your CV'}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-gray-600">
        {checkedCount} supported fact{checkedCount === 1 ? '' : 's'} or safe
        rewording{checkedCount === 1 ? '' : 's'} checked.
        {report.summary.needs_confirmation > 0
          ? ` ${report.summary.needs_confirmation} wording change${
              report.summary.needs_confirmation === 1 ? '' : 's'
            } need your confirmation.`
          : ''}
      </p>

      {reviewFindings.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {reviewFindings.map((finding, index) => (
            <TruthfulnessFindingItem
              key={`${finding.classification}-${finding.section}-${index}`}
              finding={finding}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-700">
          No unsupported or questionable claims were found.
        </p>
      )}
    </section>
  );
}

function TruthfulnessFindingItem({
  finding,
}: {
  finding: TruthfulnessFinding;
}) {
  const isBlocked = finding.classification === 'unsupported_blocked';
  if (!isBlocked && finding.classification !== 'needs_confirmation') {
    return null;
  }

  return (
    <li
      className={`rounded-xl border p-4 ${
        isBlocked
          ? 'border-danger-200 bg-danger-50'
          : 'border-warning-200 bg-warning-50'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${
            isBlocked ? 'text-danger-700' : 'text-warning-700'
          }`}
        >
          {isBlocked
            ? classificationLabels.unsupported_blocked
            : classificationLabels.needs_confirmation}
        </span>
        <span className="text-xs text-gray-500">{finding.section}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-700">{finding.detail}</p>
      {finding.proposed && (
        <p className="mt-2 text-xs leading-5 text-gray-600">
          <span className="font-semibold">Proposed wording:</span>{' '}
          {finding.proposed}
        </p>
      )}
    </li>
  );
}

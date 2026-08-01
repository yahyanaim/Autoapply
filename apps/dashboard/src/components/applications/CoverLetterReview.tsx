import { Card } from '@/components/ui/Card';

interface CoverLetterReviewProps {
  value: string;
  onChange: (value: string) => void;
}

export function CoverLetterReview({ value, onChange }: CoverLetterReviewProps) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-600">
        Cover letter
      </p>
      <h2 className="mt-1 text-xl font-semibold text-gray-900">
        Review every claim
      </h2>
      <label className="sr-only" htmlFor="application-cover-letter">
        Cover letter content
      </label>
      <textarea
        id="application-cover-letter"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={16}
        className="mt-5 w-full rounded-xl border border-gray-300 p-4 text-sm leading-7 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </Card>
  );
}

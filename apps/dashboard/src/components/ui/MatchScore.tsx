import { cn } from '@/lib/utils';

interface MatchScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MatchScore({ score, size = 'md', className }: MatchScoreProps) {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-success-500';
    if (s >= 50) return 'text-warning-500';
    return 'text-danger-500';
  };

  const getBg = (s: number) => {
    if (s >= 80) return 'bg-success-500';
    if (s >= 50) return 'bg-warning-500';
    return 'bg-danger-500';
  };

  const sizes = {
    sm: { circle: 'h-8 w-8', text: 'text-xs', ring: '32' },
    md: { circle: 'h-10 w-10', text: 'text-sm', ring: '40' },
    lg: { circle: 'h-14 w-14', text: 'text-base', ring: '56' },
  };

  const s = sizes[size];

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', s.circle, className)}
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Match score: ${score}%`}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${s.ring} ${s.ring}`}>
        <circle cx={parseInt(s.ring) / 2} cy={parseInt(s.ring) / 2} r={(parseInt(s.ring) - 4) / 2} fill="none" stroke="#E5E7EB" strokeWidth="3" />
        <circle
          cx={parseInt(s.ring) / 2}
          cy={parseInt(s.ring) / 2}
          r={(parseInt(s.ring) - 4) / 2}
          fill="none"
          className={getBg(score)}
          strokeWidth="3"
          strokeDasharray={`${(score / 100) * Math.PI * (parseInt(s.ring) - 4)} ${Math.PI * (parseInt(s.ring) - 4)}`}
          strokeLinecap="round"
        />
      </svg>
      <span className={cn('font-bold', s.text, getColor(score))}>{score}</span>
    </div>
  );
}

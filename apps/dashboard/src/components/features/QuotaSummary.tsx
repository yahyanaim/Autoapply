import { Card } from '@/components/ui/Card';

export interface QuotaSummaryValue {
  aiRequestsUsed: number;
  aiRequestsMax: number;
  resumeOptimizationsUsed: number;
  resumeOptimizationsMax: number;
  resetAt: string;
}

function formatLimit(value: number): string {
  return value >= 2_000_000_000 ? '∞' : String(value);
}

export function QuotaSummary({ quota }: { quota: QuotaSummaryValue | null }) {
  const optimizationRemaining = quota
    ? quota.resumeOptimizationsMax >= 2_000_000_000
      ? 'Unlimited CV optimizations'
      : `${Math.max(
          0,
          quota.resumeOptimizationsMax - quota.resumeOptimizationsUsed,
        )} CV optimization remaining`
    : 'Monthly plan allowance';

  return (
    <Card aria-label="Monthly AI quota">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">
          AI requests this month
        </p>
        {quota && (
          <p className="text-xs text-gray-400">
            Resets {new Date(quota.resetAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <p className="mt-4 text-3xl font-bold text-gray-900">
        {quota
          ? `${quota.aiRequestsUsed}/${formatLimit(quota.aiRequestsMax)}`
          : '—'}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-500">
        {optimizationRemaining}
      </p>
    </Card>
  );
}

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
}

export function StatsCard({ label, value, change, trend }: StatsCardProps) {
  const trendColors = {
    up: 'text-success-500',
    down: 'text-danger-500',
    neutral: 'text-gray-500',
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50">
          <svg className="h-4 w-4 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        <p className={cn('mt-1 text-sm font-medium', trendColors[trend])}>{change}</p>
      </div>
    </Card>
  );
}

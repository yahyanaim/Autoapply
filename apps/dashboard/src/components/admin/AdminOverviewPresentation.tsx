import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/** Presentation only: owners, queries, chart data and source states stay in Overview. */
export function OverviewCard({ title, subtitle, icon: Icon, children, className, compact = false }: {
  title: string;
  subtitle: ReactNode;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return <Card role="article" aria-label={title} data-slot="overview-card" className={cn(
    'min-w-0 overflow-hidden bg-white p-0',
    compact ? 'rounded-none border-0 shadow-none' : 'rounded-2xl border-border/70 shadow-[0_0_0_3px_rgba(23,23,20,0.025)]',
    className,
  )}>
    <CardHeader className="space-y-1 px-5 pb-0 pt-5 sm:px-6 sm:pt-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold leading-5 text-foreground">{title}</h2>
        <Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <CardDescription className="text-[11px] leading-[1.65]">{subtitle}</CardDescription>
    </CardHeader>
    <CardContent className={cn('px-5 pb-5 pt-4 sm:px-6 sm:pb-6', compact && 'sm:pt-5')}>{children}</CardContent>
  </Card>;
}

/** Dependency-free SVG equivalent of a chart surface; never supplies or transforms data. */
export function OverviewChartSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="overview-chart" className={cn('min-w-0 text-xs text-muted-foreground [&_svg]:block [&_svg]:w-full', className)} {...props} />;
}

export function OverviewSkeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" data-slot="skeleton" className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)} />;
}

/** Decorative proportions, not a time series or one physical mark per record. */
export function OverviewSegmentedBar({ total, segments }: {
  total: number;
  segments: { value: number; className: string }[];
}) {
  if (total <= 0) return null;
  return <div aria-hidden="true" data-slot="summary-proportions" className="flex h-5 w-full overflow-hidden bg-muted" style={{ maskImage: 'repeating-linear-gradient(to right, #000 0, #000 3px, transparent 3px, transparent 6px)' }}>
    {segments.map((segment, index) => <div key={index} data-value={segment.value} className={cn('h-full shrink-0', segment.className)} style={{ width: `${Math.min(100, Math.max(0, segment.value / total * 100))}%` }} />)}
  </div>;
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { StatsCard } from '@/components/features/StatsCard';
import { RecentActivity } from '@/components/features/RecentActivity';
import { QuickActions } from '@/components/features/QuickActions';
import { useApplications } from '@/lib/api/hooks/use-applications';
import { useResumes } from '@/lib/api/hooks/use-resumes';
import { apiClient } from '@/lib/api/api-client';

interface UsageSummary {
  totalRequests: number;
  totalCost: number;
  totalTokens: number;
  quota: {
    aiRequestsUsed: number;
    aiRequestsMax: number;
    resumeOptimizationsUsed: number;
    resumeOptimizationsMax: number;
    resetAt: string;
  } | null;
}

function formatLimit(value: number): string {
  return value >= 2_000_000_000 ? '∞' : String(value);
}

export default function DashboardPage() {
  const { applications } = useApplications({ limit: 5 });
  const { resumes } = useResumes();
  const usage = useQuery<UsageSummary>({ queryKey: ['ai-usage'], queryFn: () => apiClient.get('/ai/usage') });
  const items = applications.data?.applications ?? [];
  const total = applications.data?.total ?? 0;
  const interviews = items.filter((item) => item.status === 'interview' || item.status === 'offer').length;
  const interviewRate = total ? Math.round((interviews / Math.min(total, items.length || total)) * 100) : 0;
  const quota = usage.data?.quota;
  const optimizationRemaining = quota
    ? quota.resumeOptimizationsMax >= 2_000_000_000
      ? 'Unlimited CV optimizations'
      : `${Math.max(0, quota.resumeOptimizationsMax - quota.resumeOptimizationsUsed)} CV optimization remaining`
    : 'Monthly plan allowance';

  const stats = [
    { label: 'Total applications', value: String(total), change: 'Tracked across all stages', trend: 'neutral' as const },
    { label: 'Resumes', value: String(resumes.data?.length ?? 0), change: `${resumes.data?.filter((resume) => resume.parsedJson).length ?? 0} ready`, trend: 'neutral' as const },
    {
      label: 'AI requests this month',
      value: quota
        ? `${quota.aiRequestsUsed}/${formatLimit(quota.aiRequestsMax)}`
        : '—',
      change: optimizationRemaining,
      trend: 'neutral' as const,
    },
    { label: 'Interview rate', value: `${interviewRate}%`, change: 'From recent applications', trend: interviewRate > 0 ? 'up' as const : 'neutral' as const },
  ];
  const activities = items.map((item) => ({
    type: item.status === 'interview' ? 'interview' as const : 'application' as const,
    description: `${item.job.title} at ${item.job.company?.name || 'company not listed'} is ${item.status}`,
    timestamp: new Date(item.updatedAt).toLocaleDateString(),
  }));

  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-bold text-gray-900">Dashboard</h1><p className="mt-1 text-sm text-gray-500">Your live job-search overview.</p></div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{stats.map((stat) => <StatsCard key={stat.label} {...stat} />)}</div>
      <div className="grid gap-6 lg:grid-cols-3"><div className="lg:col-span-2"><RecentActivity items={activities} /></div><QuickActions /></div>
    </div>
  );
}

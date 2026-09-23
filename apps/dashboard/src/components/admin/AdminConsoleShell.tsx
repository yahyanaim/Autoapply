'use client';

import Link from 'next/link';
import { Bell, BriefcaseBusiness, ChartNoAxesCombined, FileWarning, FileText, Gauge, ShieldCheck, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navigation = [
  { label: 'Overview', href: '/admin/console/overview', icon: Gauge, enabled: true },
  { label: 'Users', href: '/admin/console/users', icon: Users, enabled: true },
  { label: 'Activity Log', href: '/admin/console/activity-logs', icon: FileText, enabled: true },
  { label: 'Billing', href: '/admin/console/billing', icon: ChartNoAxesCombined, enabled: false },
  { label: 'Jobs', href: '/admin/console/jobs', icon: BriefcaseBusiness, enabled: false },
  { label: 'Resume Failures', href: '/admin/console/resume-failures', icon: FileWarning, enabled: false },
  { label: 'Beta Gate', href: '/admin/console/beta-gate', icon: ShieldCheck, enabled: false },
  { label: 'Notifications', href: '/admin/console/notifications', icon: Bell, enabled: false },
];

export function isAdminConsoleEnabled() {
  return process.env.NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED === 'true';
}

export function AdminConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enabled = isAdminConsoleEnabled();

  return (
    <div className="min-h-[100dvh] bg-[#f7f7f5] text-gray-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#171717] text-sm font-bold text-white">A</div>
          <div>
            <p className="text-sm font-semibold tracking-tight">ApplyAI Admin Console</p>
            <p className="text-xs text-gray-500">Operations workspace</p>
          </div>
          <span className="ml-auto rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-gray-600">Read-only</span>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="border-b border-stone-200 bg-white px-3 py-4 lg:min-h-[calc(100dvh-65px)] lg:border-b-0 lg:border-r">
          <nav aria-label="Admin Console navigation" className="flex gap-1 overflow-x-auto lg:flex-col">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== '/admin/console' && pathname.startsWith(`${item.href}/`));
              if (!item.enabled || !enabled) {
                return <span key={item.label} aria-disabled="true" className="flex shrink-0 cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-400"><Icon className="h-4 w-4" />{item.label}<span className="ml-auto text-[10px]">Soon</span></span>;
              }
              return <Link key={item.href} href={item.href} className={cn('flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition', active ? 'bg-orange-50 text-orange-800' : 'text-gray-600 hover:bg-stone-100 hover:text-gray-950')}><Icon className="h-4 w-4" />{item.label}</Link>;
            })}
          </nav>
        </aside>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          {enabled ? children : <AdminUnavailable />}
        </main>
      </div>
    </div>
  );
}

function AdminUnavailable() {
  return <section className="mx-auto max-w-xl border border-stone-200 bg-white p-6" aria-live="polite"><p className="text-sm font-semibold">Admin Console unavailable</p><p className="mt-2 text-sm leading-6 text-gray-600">This workspace is disabled by the Admin Console feature flag. API authorization remains enforced independently.</p></section>;
}

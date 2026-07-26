'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  BriefcaseBusiness,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Workflow,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/api/hooks/use-auth';
import { cn } from '@/lib/utils';

const navigation = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Resumes', href: '/resumes', icon: FileText },
  { label: 'Jobs', href: '/jobs', icon: BriefcaseBusiness },
  { label: 'Applications', href: '/applications', icon: Workflow },
  { label: 'Billing', href: '/billing', icon: CreditCard },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isInitialized, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isInitialized && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isInitialized, router]);

  if (!isInitialized || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <Spinner size="lg" />
      </div>
    );
  }

  const initials = (user?.profile?.fullName || user?.email || 'A')
    .split(/[ @]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <div className="product-grid fixed inset-x-0 top-0 h-[420px] opacity-60" aria-hidden="true" />
      <header className="relative z-40 px-4 pt-4 sm:px-6 sm:pt-6">
        <nav className="glass-panel mx-auto flex max-w-[1280px] items-center gap-5 rounded-2xl border border-white/80 px-4 py-2.5">
          <Link href="/dashboard" className="shrink-0 text-xl font-black tracking-[-0.04em] text-primary-500">
            APPLYAI
          </Link>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
            {navigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-orange-50 text-primary-600'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="max-w-36 truncate text-xs font-semibold text-gray-800">
                {user?.profile?.fullName || user?.email}
              </p>
              <p className="text-[11px] capitalize text-gray-400">{user?.role?.toLowerCase()}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#171717] text-xs font-bold text-white">
              {initials}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => void logout()}
              className="text-gray-400 hover:text-gray-900"
            >
              <LogOut />
            </Button>
          </div>
        </nav>

        <div className="mx-auto mt-2 flex max-w-[1280px] gap-1 overflow-x-auto rounded-xl border bg-white/85 p-1.5 shadow-sm backdrop-blur lg:hidden">
          {navigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium',
                  active ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      <main className="relative mx-auto max-w-[1280px] px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
    </div>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/api/hooks/use-auth';

const breadcrumbMap: Record<string, string> = {
  dashboard: 'Dashboard',
  resumes: 'Resumes',
  jobs: 'Jobs',
  applications: 'Applications',
  billing: 'Billing',
  settings: 'Settings',
};

export function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs = segments.map((segment) => breadcrumbMap[segment] || segment);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-2">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-300">/</span>}
            <span className={`text-sm ${i === breadcrumbs.length - 1 ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
              {crumb}
            </span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-sm font-semibold text-white">
            {(user?.profile?.fullName || user?.email || 'A').split(/[ @]/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
          </div>
          <button onClick={() => void logout()} className="text-sm font-medium text-gray-600 hover:text-gray-900">Sign out</button>
        </div>
      </div>
    </header>
  );
}

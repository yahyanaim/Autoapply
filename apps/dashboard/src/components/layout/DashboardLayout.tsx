'use client';

import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 lg:pl-[280px] max-lg:pl-[72px]">
        <Header />
        <main className="mx-auto max-w-[1440px] px-6 py-6">
          <div className="grid grid-cols-12 gap-gutter">{children}</div>
        </main>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Spinner } from '@/components/ui/Spinner';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const initialize = useAuthStore((state) => state.initialize);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isInitialized) return;
    if (isAuthenticated) router.replace('/dashboard');
    else setFailed(true);
  }, [isAuthenticated, isInitialized, router]);

  if (failed && !isAuthenticated) {
    return (
      <div className="rounded-2xl border border-danger-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Sign-in could not be completed</h1>
        <button className="mt-4 text-sm font-medium text-primary-600" onClick={() => router.replace('/login')}>
          Return to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 text-sm text-gray-600">
      <Spinner /> Completing sign-in…
    </div>
  );
}

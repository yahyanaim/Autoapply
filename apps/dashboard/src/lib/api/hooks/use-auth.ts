import { useAuthStore } from '@/lib/stores/auth-store';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useAuth() {
  const { user, isAuthenticated, isInitialized, login, register, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = useCallback(async () => {
    await logout();
    router.replace('/login');
  }, [logout, router]);

  return {
    user,
    isAuthenticated,
    isInitialized,
    login,
    register,
    logout: handleLogout,
  };
}

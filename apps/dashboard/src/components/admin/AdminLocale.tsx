'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type AdminLocale = 'ar' | 'en' | 'fr';

export const ADMIN_LOCALE_STORAGE_KEY = 'applyai-admin-locale';

export function isAdminLocale(value: unknown): value is AdminLocale {
  return value === 'ar' || value === 'en' || value === 'fr';
}

type AdminLocaleContextValue = { locale: AdminLocale; setLocale: (locale: AdminLocale) => void };

const AdminLocaleContext = createContext<AdminLocaleContextValue>({ locale: 'ar', setLocale: () => undefined });

export function AdminLocaleProvider({ children, initialLocale = 'en', persist = true }: { children: ReactNode; initialLocale?: AdminLocale; persist?: boolean }) {
  const [locale, updateLocale] = useState<AdminLocale>(initialLocale);

  useEffect(() => {
    if (!persist) return;
    try {
      const stored = window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY);
      if (isAdminLocale(stored)) updateLocale(stored);
    } catch {
      // A blocked storage API must not block the Admin Console.
    }
  }, [persist]);

  const setLocale = useCallback((next: AdminLocale) => {
    updateLocale(next);
    if (!persist) return;
    try {
      window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, next);
    } catch {
      // Language selection still works for this page when storage is blocked.
    }
  }, [persist]);

  return <AdminLocaleContext.Provider value={{ locale, setLocale }}>{children}</AdminLocaleContext.Provider>;
}

export function useAdminLocale() {
  return useContext(AdminLocaleContext);
}

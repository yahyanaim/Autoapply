'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Bell, Check, ChevronDown, CircleUserRound, Globe2, LogOut, Pencil, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/api/hooks/use-auth';
import { cn } from '@/lib/utils';
import { useAdminLocale, type AdminLocale } from './AdminLocale';

export const adminIconButton = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';
export const adminNavSurface = 'rounded-full border border-border/70 bg-white shadow-[0_2px_8px_rgba(23,23,20,0.035)]';

const copy = {
  en: { language: 'Change language', notifications: 'Notification operations', account: 'Admin account', profile: 'View profile', edit: 'Edit profile', logout: 'Sign out', signingOut: 'Signing out…', logoutError: 'Could not complete sign out. Please try again.', fallback: 'Your account', session: 'Current signed-in account' },
  ar: { language: 'تغيير اللغة', notifications: 'عمليات الإشعارات', account: 'حساب المسؤول', profile: 'عرض الملف الشخصي', edit: 'تعديل الملف الشخصي', logout: 'تسجيل الخروج', signingOut: 'جارٍ تسجيل الخروج…', logoutError: 'تعذّر إكمال تسجيل الخروج. حاول مجددًا.', fallback: 'حسابك', session: 'الحساب المسجّل حاليًا' },
  fr: { language: 'Changer de langue', notifications: 'Gestion des notifications', account: 'Compte administrateur', profile: 'Voir le profil', edit: 'Modifier le profil', logout: 'Se déconnecter', signingOut: 'Déconnexion…', logoutError: 'Impossible de terminer la déconnexion. Réessayez.', fallback: 'Votre compte', session: 'Compte actuellement connecté' },
} as const;

/** Native disclosure keeps keyboard behavior without adding a dropdown dependency. */
function HeaderDisclosure({ label, summary, children, className }: {
  label: string;
  summary: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const id = useId();
  const close = useCallback(() => { if (ref.current) ref.current.open = false; }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        close();
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [close]);
  return <details ref={ref} className="relative shrink-0" onBlur={(event) => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <summary aria-label={label} aria-controls={id} className={cn(adminIconButton, 'cursor-pointer list-none [&::-webkit-details-marker]:hidden', className)}>{summary}</summary>
    <div id={id} className="absolute end-0 top-[calc(100%+10px)] z-50 w-60 max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-white p-1.5 text-start text-xs shadow-lg">
      {children(close)}
    </div>
  </details>;
}

export function AdminHeaderControls({ locale, languageEnabled, operationsEnabled }: { locale: AdminLocale; languageEnabled: boolean; operationsEnabled: boolean }) {
  const { locale: selectedLocale, setLocale } = useAdminLocale();
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const text = copy[locale];
  const name = user?.profile?.fullName || text.fallback;
  const accountLink = 'flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return <>
    <div className={cn(adminNavSurface, 'ms-auto flex h-12 shrink-0 items-center gap-0.5 p-0.5 sm:h-14 sm:p-1.5')}>
      {operationsEnabled ? <Link href="/admin/console/notifications" aria-label={text.notifications} title={text.notifications} className={adminIconButton}>
        <Bell aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </Link> : <span aria-disabled="true" aria-label={text.notifications} title={text.notifications} className={cn(adminIconButton, 'cursor-not-allowed opacity-40')}><Bell aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>}
      {languageEnabled ? <HeaderDisclosure label={text.language} summary={<Globe2 aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />}>
        {(close) => <div role="group" aria-label={text.language}>
          <p className="px-3 py-2 text-[11px] font-medium text-muted-foreground">{text.language}</p>
          {(['ar', 'en', 'fr'] as const).map((option) => <Button key={option} type="button" variant="ghost" lang={option} aria-pressed={selectedLocale === option} onClick={() => { setLocale(option); close(); }} className="min-h-11 w-full justify-start rounded-xl px-3 text-xs font-medium">
            <span className="flex-1 text-start">{{ ar: 'العربية', en: 'English', fr: 'Français' }[option]}</span>
            <span aria-hidden="true" className="text-[10px] uppercase text-muted-foreground">{option}</span>
            {selectedLocale === option ? <Check aria-hidden="true" /> : null}
          </Button>)}
        </div>}
      </HeaderDisclosure> : null}
    </div>
    <HeaderDisclosure label={text.account} className={cn(adminNavSurface, 'h-12 w-auto gap-2 p-1 sm:h-14 sm:p-1.5 xl:pe-3')} summary={<>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-700"><CircleUserRound aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} /></span>
      <span className="hidden max-w-32 text-start xl:block"><bdi className="block truncate text-xs font-semibold text-foreground">{name}</bdi><span className="block text-[10px] text-muted-foreground">{text.account}</span></span>
      <ChevronDown aria-hidden="true" className="hidden h-3.5 w-3.5 xl:block" />
    </>}>
      {(close) => <>
        <div className="border-b border-border/70 px-3 py-3"><p className="text-[10px] text-muted-foreground">{text.session}</p><bdi className="mt-1 block truncate font-semibold text-foreground">{name}</bdi>{user?.email ? <bdi dir="ltr" className="mt-0.5 block truncate text-[11px] text-muted-foreground">{user.email}</bdi> : null}</div>
        <Link href="/settings" className={accountLink} onClick={close}><UserRound aria-hidden="true" className="h-4 w-4" />{text.profile}</Link>
        <Link href="/settings" className={accountLink} onClick={close}><Pencil aria-hidden="true" className="h-4 w-4" />{text.edit}</Link>
        <div className="mt-1 border-t border-border/70 pt-1">
          <Button type="button" variant="ghost" disabled={busy} className="min-h-11 w-full justify-start rounded-xl px-3 text-xs text-destructive" onClick={async () => {
            if (busy) return;
            setBusy(true); setError(false);
            try { await logout(); close(); } catch { setError(true); } finally { setBusy(false); }
          }}><LogOut aria-hidden="true" />{busy ? text.signingOut : text.logout}</Button>
          {error ? <p role="alert" className="px-3 pb-2 text-[11px] leading-5 text-destructive">{text.logoutError}</p> : null}
        </div>
      </>}
    </HeaderDisclosure>
  </>;
}

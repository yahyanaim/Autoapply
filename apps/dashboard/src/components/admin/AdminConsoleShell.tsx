'use client';

import Link from 'next/link';
import { Bell, BriefcaseBusiness, ChartNoAxesCombined, ClipboardList, FileWarning, FileText, Gauge, Menu, ShieldCheck, Users, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApplyAILogo } from '@/components/brand/ApplyAILogo';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { AdminLocaleProvider, useAdminLocale, type AdminLocale } from './AdminLocale';
import { AdminHeaderControls, adminIconButton, adminNavSurface } from './AdminHeaderControls';

const navigation = [
  { label: 'Overview', href: '/admin/console/overview', icon: Gauge, enabled: true },
  { label: 'Users', href: '/admin/console/users', icon: Users, enabled: true },
  { label: 'Activity Log', href: '/admin/console/activity-logs', icon: FileText, enabled: true },
  { label: 'Metrics', href: '/admin/console/metrics', icon: ChartNoAxesCombined, enabled: true },
  { label: 'Financial checks', href: '/admin/console/billing-completeness', icon: ClipboardList, enabled: true },
  { label: 'Webhook issues', href: '/admin/console/verified-webhooks', icon: FileWarning, enabled: true },
  { label: 'Jobs', href: '/admin/console/jobs', icon: BriefcaseBusiness, enabled: true },
  { label: 'Resume Failures', href: '/admin/console/resume-failures', icon: FileWarning, enabled: true },
  { label: 'Beta Gate', href: '/admin/console/beta-gate', icon: ShieldCheck, enabled: true },
  { label: 'Notifications', href: '/admin/console/notifications', icon: Bell, enabled: true },
  { label: 'Applications', href: '/admin/console/applications', icon: ClipboardList, enabled: true },
];

const shellCopy = {
  ar: {
    console: 'وحدة الإدارة', workspace: 'مساحة العمليات', navigation: 'تنقل وحدة الإدارة',
    unavailable: 'وحدة الإدارة غير متاحة', unavailableDetail: 'هذه المساحة معطّلة بعلم الميزة. يظل التفويض مفروضًا بصورة مستقلة عبر واجهة API.',
    soon: 'قريبًا', home: 'الصفحة الرئيسية لـ ApplyAI', language: 'اللغة', openNav: 'فتح قائمة التنقل', closeNav: 'إغلاق قائمة التنقل',
    nav: ['نظرة عامة', 'المستخدمون', 'سجل النشاط', 'المؤشرات', 'الفحوص المالية', 'مشكلات Webhook', 'الوظائف', 'إخفاقات السيرة الذاتية', 'بوابة Beta', 'الإشعارات', 'الطلبات'],
  },
  en: {
    console: 'Admin Console', workspace: 'Operations workspace', navigation: 'Admin Console navigation',
    unavailable: 'Admin Console unavailable', unavailableDetail: 'This workspace is disabled by the Admin Console feature flag. API authorization remains enforced independently.',
    soon: 'Soon', home: 'ApplyAI home', language: 'Language', openNav: 'Open navigation', closeNav: 'Close navigation',
    nav: ['Overview', 'Users', 'Activity Log', 'Metrics', 'Financial checks', 'Webhook issues', 'Jobs', 'Resume Failures', 'Beta Gate', 'Notifications', 'Applications'],
  },
  fr: {
    console: 'Console admin', workspace: 'Espace des opérations', navigation: 'Navigation de la console admin',
    unavailable: 'Console admin indisponible', unavailableDetail: "Cet espace est désactivé par le drapeau de fonctionnalité. L’autorisation de l’API reste appliquée indépendamment.",
    soon: 'Bientôt', home: 'Accueil ApplyAI', language: 'Langue', openNav: 'Ouvrir la navigation', closeNav: 'Fermer la navigation',
    nav: ['Vue d’ensemble', 'Utilisateurs', 'Journal d’activité', 'Indicateurs', 'Contrôles financiers', 'Problèmes Webhook', 'Offres', 'Échecs de CV', 'Accès bêta', 'Notifications', 'Candidatures'],
  },
} as const;

export function isAdminConsoleEnabled() {
  return process.env.NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED === 'true';
}

export function AdminConsoleShell({ children }: { children: React.ReactNode }) {
  return <AdminLocaleProvider><AdminConsoleFrame>{children}</AdminConsoleFrame></AdminLocaleProvider>;
}

function AdminConsoleFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enabled = isAdminConsoleEnabled();
  const { locale } = useAdminLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const isOverview = pathname === '/admin/console/overview';
  // Other existing Admin views retain their original English content until they have reviewed translations.
  const visibleLocale = isOverview ? locale : 'en';
  const copy = shellCopy[visibleLocale];
  const currentIndex = navigation.findIndex((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mobileOpen) { setMobileOpen(false); menuRef.current?.focus(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [mobileOpen]);

  return (
    <div lang={visibleLocale} dir={visibleLocale === 'ar' ? 'rtl' : 'ltr'} className="min-h-[100dvh] bg-[#f7f7f5] text-[#171714]">
      <header className="relative z-30 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto flex max-w-[1460px] items-center gap-1.5 sm:gap-3">
          <Button ref={menuRef} type="button" variant="ghost" size="icon" aria-label={mobileOpen ? copy.closeNav : copy.openNav} aria-expanded={mobileOpen} aria-controls="admin-navigation" onClick={() => setMobileOpen((open) => !open)} className={cn(adminNavSurface, 'h-12 w-11 shrink-0 rounded-full lg:hidden')}>
            {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
          <Link href="/" aria-label={copy.home} className={cn(adminNavSurface, 'inline-flex h-12 shrink-0 items-center px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-14 sm:px-4')}>
            <ApplyAILogo className="h-5 w-auto sm:h-8" priority />
          </Link>
          <div className={cn(adminNavSurface, 'hidden h-14 min-w-0 items-center gap-3 px-5 lg:flex')}>
            <div><p className="text-xs font-semibold">{copy.console}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{copy.workspace}</p></div>
            {currentIndex >= 0 ? <><span aria-hidden="true" className="h-5 w-px bg-border" /><span className="truncate text-xs font-medium text-primary-800">{copy.nav[currentIndex]}</span></> : null}
          </div>
          <AdminHeaderControls locale={visibleLocale} languageEnabled={isOverview} operationsEnabled={enabled} />
        </div>
      </header>
      <div className="mx-auto grid max-w-[1460px] gap-3 px-3 pb-10 pt-4 sm:px-6 lg:grid-cols-[72px_minmax(0,1fr)] lg:gap-5">
        <aside id="admin-navigation" className={cn('min-w-0 self-start rounded-[28px] border border-border/70 bg-white p-3 shadow-[0_2px_8px_rgba(23,23,20,0.035)] lg:sticky lg:top-4 lg:flex lg:w-[72px] lg:justify-center lg:px-2 lg:py-4', mobileOpen ? 'block' : 'hidden lg:block')}>
          <nav aria-label={copy.navigation} className="flex flex-col gap-1 lg:items-center lg:gap-2">
            {navigation.map((item, index) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== '/admin/console' && pathname.startsWith(`${item.href}/`));
              if (!item.enabled || !enabled) {
                return <span key={item.label} aria-disabled="true" aria-label={`${copy.nav[index]} — ${copy.soon}`} title={`${copy.nav[index]} — ${copy.soon}`} className="flex min-h-11 items-center gap-3 rounded-full px-3 text-xs text-gray-400 lg:h-11 lg:w-11 lg:justify-center lg:px-0"><Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} /><span className="lg:sr-only">{copy.nav[index]}</span><span className="ms-auto text-[10px] lg:sr-only">{copy.soon}</span></span>;
              }
              return <Link key={item.href} href={item.href} aria-label={copy.nav[index]} title={copy.nav[index]} aria-current={active ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={cn(adminIconButton, 'w-full justify-start gap-3 px-3 text-xs font-medium lg:w-11 lg:justify-center lg:px-0', active && 'bg-primary-700 text-white shadow-sm hover:bg-primary-800 hover:text-white')}><Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} /><span className="lg:sr-only">{copy.nav[index]}</span></Link>;
            })}
          </nav>
        </aside>
        <main id="admin-main" className="min-w-0">
          {enabled ? children : <AdminUnavailable locale={visibleLocale} />}
        </main>
      </div>
    </div>
  );
}

function AdminUnavailable({ locale }: { locale: AdminLocale }) {
  const copy = shellCopy[locale];
  return <section className="mx-auto max-w-xl rounded-xl border border-black/[0.07] bg-white p-5 shadow-[0_4px_16px_rgba(23,23,20,0.025)]" aria-live="polite"><p className="text-sm font-semibold">{copy.unavailable}</p><p className="mt-2 text-xs leading-5 text-gray-600">{copy.unavailableDetail}</p></section>;
}

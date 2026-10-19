import { act, type AnchorHTMLAttributes } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView } from '@/test/render';
import { AdminConsoleShell } from './AdminConsoleShell';

const auth = vi.hoisted(() => ({ logout: vi.fn(), user: { email: 'admin@example.test', profile: { fullName: 'Test Administrator' } } }));
const route = vi.hoisted(() => ({ pathname: '/admin/console/overview' }));
vi.mock('@/lib/api/hooks/use-auth', () => ({ useAuth: () => auth }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('next/link', () => ({ default: ({ children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} onClick={(event) => { event.preventDefault(); onClick?.(event); }}>{children}</a> }));

function disclosure(container: Element, name: string) {
  const summary = container.querySelector<HTMLElement>(`summary[aria-label="${name}"]`);
  if (!summary) throw new Error(`Missing disclosure ${name}`);
  return { summary, details: summary.parentElement as HTMLDetailsElement };
}

const brandColors = createRequire(import.meta.url)('../../../tailwind.config.js').theme.extend.colors.primary as Record<string, string>;
function whiteContrast(hex: string) {
  const linear = hex.slice(1).match(/../g)!.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] + 0.05);
}

describe('AdminConsoleShell navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'true');
    window.localStorage.clear();
    route.pathname = '/admin/console/overview';
    auth.logout.mockResolvedValue(undefined);
  });

  it('uses the Nexora-inspired floating rail with the original destinations, accessible labels and actual ApplyAI logo', () => {
    const rendered = renderView(<AdminConsoleShell><p>Overview content unchanged</p></AdminConsoleShell>);
    const sidebar = rendered.required<HTMLElement>('#admin-navigation');
    expect(sidebar.className).toContain('lg:w-[72px]');
    expect(sidebar.querySelectorAll('a')).toHaveLength(11);
    for (const link of Array.from(sidebar.querySelectorAll('a'))) {
      expect(link.getAttribute('aria-label')).toBeTruthy();
      expect(link.getAttribute('title')).toBe(link.getAttribute('aria-label'));
      expect(link.className).toContain('focus-visible');
      expect(link.className).toContain('h-11');
    }
    expect(sidebar.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/admin/console/overview');
    const logoUrl = new URL(rendered.required<HTMLImageElement>('img[alt="ApplyAI"]').src);
    expect(logoUrl.searchParams.get('url')).toBe('/images/applyai-logo.png');
    expect(rendered.container.querySelector('header a[aria-label="Notification operations"]')?.getAttribute('href')).toBe('/admin/console/notifications');
    expect(rendered.container.querySelector('header a[aria-label="Notification operations"] svg')).not.toBeNull();
    expect(rendered.container.textContent).toContain('Overview content unchanged');
    expect(auth.logout).not.toHaveBeenCalled();
    rendered.cleanup();
  });

  it('opens and closes labeled mobile navigation, including Escape with focus restoration', () => {
    const rendered = renderView(<AdminConsoleShell><p>Overview</p></AdminConsoleShell>);
    const trigger = rendered.required<HTMLButtonElement>('button[aria-controls="admin-navigation"]');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(rendered.required('#admin-navigation').className).not.toContain('hidden lg:block');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    click(trigger);
    click(rendered.required<HTMLAnchorElement>('#admin-navigation a[href="/admin/console/jobs"]'));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    rendered.cleanup();
  });

  it('uses AA brand-token contrast for desktop/mobile active text, icons and hover with visible keyboard focus', () => {
    const rendered = renderView(<AdminConsoleShell><p>Overview</p></AdminConsoleShell>);
    const active = rendered.required<HTMLAnchorElement>('#admin-navigation a[aria-current="page"]');
    for (const prefix of ['bg-primary-', 'hover:bg-primary-']) {
      const shade = active.className.split(' ').find((token) => token.startsWith(prefix))!.slice(prefix.length);
      expect(whiteContrast(brandColors[shade])).toBeGreaterThanOrEqual(4.5);
    }
    expect(active.className).toContain('text-white');
    expect(active.className).toContain('hover:text-white');
    expect(active.querySelector('svg')).not.toBeNull();
    expect(active.className).toContain('focus-visible:ring-2');
    const focusShade = active.className.split(' ').find((token) => token.startsWith('focus-visible:ring-primary-'))!.split('-').pop()!;
    expect(whiteContrast(brandColors[focusShade])).toBeGreaterThanOrEqual(3);
    act(() => active.focus());
    expect(document.activeElement).toBe(active);
    const desktopClasses = active.className;
    click(rendered.required<HTMLButtonElement>('button[aria-controls="admin-navigation"]'));
    expect(rendered.required('#admin-navigation').className).not.toContain('hidden lg:block');
    expect(rendered.required('#admin-navigation a[aria-current="page"]').className).toBe(desktopClasses);
    expect(active.className).toContain('h-11');
    expect(active.getAttribute('aria-label')).toBe('Overview');
    rendered.cleanup();
  });

  it('keeps Admin navigation and the notification shortcut inaccessible when the feature flag is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'false');
    const rendered = renderView(<AdminConsoleShell><p>Private overview</p></AdminConsoleShell>);
    expect(rendered.container.querySelector('#admin-navigation a')).toBeNull();
    expect(rendered.container.querySelector('header a[href="/admin/console/notifications"]')).toBeNull();
    expect(rendered.container.querySelector('header [aria-label="Notification operations"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(rendered.container.textContent).not.toContain('Private overview');
    expect(rendered.container.textContent).toContain('Admin Console unavailable');
    expect(auth.logout).not.toHaveBeenCalled();
    rendered.cleanup();
  });

  it('provides a globe disclosure, retains all three languages, and changes no route or data', () => {
    const rendered = renderView(<AdminConsoleShell><p>Original content</p></AdminConsoleShell>);
    const menu = disclosure(rendered.container, 'Change language');
    expect(menu.summary.querySelector('svg')).not.toBeNull();
    click(menu.summary);
    expect(menu.details.open).toBe(true);
    const french = rendered.required<HTMLButtonElement>('button[lang="fr"]');
    click(french);
    expect(french.getAttribute('aria-pressed')).toBe('true');
    expect(menu.details.open).toBe(false);
    expect(rendered.container.querySelector('[lang="fr"][dir="ltr"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain('Original content');
    expect(window.localStorage.getItem('applyai-admin-locale')).toBe('fr');
    expect(auth.logout).not.toHaveBeenCalled();
    rendered.cleanup();
  });
  it.each(['/admin/console/beta-gate', '/admin/console/notifications', '/admin/console/applications'])('enables reviewed locale controls on %s without changing destinations', (pathname) => {
    route.pathname = pathname;
    window.localStorage.setItem('applyai-admin-locale', 'ar');
    const rendered = renderView(<AdminConsoleShell><p>Safe read page</p></AdminConsoleShell>);
    expect(rendered.container.querySelector('[lang="ar"][dir="rtl"]')).not.toBeNull();
    expect(rendered.container.querySelector('summary[aria-label="تغيير اللغة"]')).not.toBeNull();
    expect(rendered.container.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe(pathname);
    expect(auth.logout).not.toHaveBeenCalled(); rendered.cleanup();
  });

  it('uses only the existing account profile/edit destination and supported logout, with no request on opening', async () => {
    const rendered = renderView(<AdminConsoleShell><p>Overview</p></AdminConsoleShell>);
    const menu = disclosure(rendered.container, 'Admin account');
    click(menu.summary);
    expect(menu.details.open).toBe(true);
    expect(menu.details.textContent).toContain('Test Administrator');
    const links = Array.from(menu.details.querySelectorAll('a'));
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([['View profile', '/settings'], ['Edit profile', '/settings']]);
    expect(auth.logout).not.toHaveBeenCalled();
    let finish!: () => void;
    auth.logout.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const signOut = menu.details.querySelector<HTMLButtonElement>('button')!;
    click(signOut);
    expect(signOut.disabled).toBe(true);
    expect(signOut.textContent).toContain('Signing out');
    click(signOut);
    expect(auth.logout).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(menu.details.open).toBe(false);
    rendered.cleanup();
  });

  it('does not reveal an arbitrary sign-out error and supports Escape/outside-dismissal for header disclosures', async () => {
    auth.logout.mockRejectedValueOnce(new Error('PRIVATE_TOKEN_OR_PROVIDER_ERROR'));
    const rendered = renderView(<AdminConsoleShell><p>Overview</p></AdminConsoleShell>);
    const menu = disclosure(rendered.container, 'Admin account');
    click(menu.summary);
    click(menu.details.querySelector<HTMLButtonElement>('button')!);
    await vi.waitFor(() => expect(menu.details.querySelector('[role="alert"]')?.textContent).toBe('Could not complete sign out. Please try again.'));
    expect(rendered.container.textContent).not.toContain('PRIVATE_TOKEN_OR_PROVIDER_ERROR');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menu.details.open).toBe(false);
    expect(document.activeElement).toBe(menu.summary);
    click(menu.summary);
    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(menu.details.open).toBe(false);
    rendered.cleanup();
  });
});

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView } from '@/test/render';
import { AdminOverviewPage } from './AdminOverviewPage';
import { AdminConsoleShell } from './AdminConsoleShell';

const api = vi.hoisted(() => ({
  overview: vi.fn(), betaGate: vi.fn(), notifications: vi.fn(),
  applications: vi.fn(), metrics: vi.fn(), verifiedWebhooks: vi.fn(),
  billingCompleteness: vi.fn(), retryVerifiedWebhook: vi.fn(),
}));
const route = vi.hoisted(() => ({ pathname: '/admin/console/overview' }));

vi.mock('@/lib/api/admin-api-client', () => ({ adminApiClient: { adminConsole: api } }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/lib/api/hooks/use-auth', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));

const period = { from: '2026-10-08T00:00:00.000Z', to: '2026-10-09T00:00:00.000Z' };
const amounts = {
  grossRevenueMinor: 0, refundAdjustmentMinor: 0, disputeWithdrawalMinor: 0,
  disputeReinstatementMinor: 0, recordedStripeFeeMinor: 0, recordedNetRevenueMinor: 0,
  estimatedAiCostMicroUsd: 0, estimatedContributionMarginMicroUsd: 0,
};
const financial = {
  status: 'full', asOf: '2026-10-09T12:00:00.000Z',
  actualCoveredRange: { from: '2026-10-03T00:00:00.000Z', toExclusive: '2026-10-09T12:00:00.000Z' },
  totals: amounts,
  daily: [{ day: '2026-10-08', coverage: 'complete', ...amounts }],
};

function view(node: ReactNode) {
  return renderView(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

function withClient(client: QueryClient) {
  return renderView(<QueryClientProvider client={client}><AdminOverviewPage /></QueryClientProvider>);
}

async function waitForText(container: Element, text: string) {
  await vi.waitFor(() => expect(container.textContent).toContain(text));
}

function card(container: Element, title: string) {
  const found = container.querySelector<HTMLElement>(`[aria-label="${title}"]`);
  if (!found) throw new Error(`Missing card: ${title}`);
  return found;
}

describe('AdminOverviewPage', () => {
  afterEach(() => { vi.useRealTimers(); focusManager.setFocused(undefined); });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    route.pathname = '/admin/console/overview';
    api.overview.mockResolvedValue({ suspendedUserCount: 2 });
    api.betaGate.mockResolvedValue({ enabled: true, registrationCount: 42, capacity: 100, remainingSlots: 58, status: 'open', updatedAt: '2026-10-09T10:00:00.000Z' });
    api.notifications.mockResolvedValue({ period, rollup: { total: 3, pending: 0, sent: 2, failed: 1, read: 0 }, failures: [], limit: 1, nextCursor: null });
    api.applications.mockResolvedValue({ period, total: 5, byStatus: { applied: 5 } });
    api.metrics.mockResolvedValue({ recordedFinancials: financial });
    api.verifiedWebhooks.mockResolvedValue({ coverage: 'covered', coverageStartAt: period.from, requestedRange: period, coveredRange: period, asOf: financial.asOf, items: [], limit: 3, nextCursor: null });
  });

  it('uses only bounded typed reads, labels their distinct windows, and exposes no scan or mutation on load', async () => {
    const rendered = view(<AdminOverviewPage />);
    await waitForText(rendered.container, 'سعة قبول Beta');
    await waitForText(rendered.container, '42 / 100');
    const capacityMeter = card(rendered.container, 'سعة قبول Beta').querySelector('[role="meter"]');
    expect(capacityMeter?.getAttribute('aria-valuenow')).toBe('42');
    expect(capacityMeter?.getAttribute('aria-valuemax')).toBe('100');
    await waitForText(rendered.container, 'نافذة رصد 24 ساعة');
    expect(rendered.container.textContent).toContain('نافذة رصد 30 يومًا');
    expect(rendered.container.textContent).toContain('ليست انتقالات مسار تاريخية');
    expect(rendered.container.textContent).toContain('ليست إجمالي الحوادث');
    const arabicOverview = rendered.container.querySelector('[dir="rtl"][lang="ar"]');
    expect(arabicOverview).not.toBeNull();
    expect(arabicOverview?.className).not.toContain('font-sans');
    expect(rendered.container.querySelector('[aria-label="سعة قبول Beta"] bdi[dir="ltr"]')).not.toBeNull();
    expect(api.notifications).toHaveBeenCalledWith(expect.objectContaining({ limit: 1, createdFrom: expect.any(String), createdTo: expect.any(String) }));
    expect(api.applications).toHaveBeenCalledWith(expect.objectContaining({ createdFrom: expect.any(String), createdTo: expect.any(String) }));
    const notificationWindow = api.notifications.mock.calls[0][0];
    const applicationWindow = api.applications.mock.calls[0][0];
    expect(Date.parse(notificationWindow.createdTo) - Date.parse(notificationWindow.createdFrom)).toBe(24 * 60 * 60 * 1000);
    expect(Date.parse(applicationWindow.createdTo) - Date.parse(applicationWindow.createdFrom)).toBe(30 * 24 * 60 * 60 * 1000);
    expect(rendered.container.querySelector('header')?.textContent).toContain('الرصد التشغيلي');
    expect(api.metrics).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    expect(api.verifiedWebhooks).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(api.retryVerifiedWebhook).not.toHaveBeenCalled();
    expect(card(rendered.container, 'توزيع الطلبات').querySelector('figure[aria-label="توزيع الحالات الحالية للطلبات المنشأة في نطاق الرصد"]')).not.toBeNull();
    expect(card(rendered.container, 'المؤشرات المالية المسجّلة').querySelector('figure[aria-label="الإيراد الصافي المسجّل حسب اليوم"]')).not.toBeNull();
    expect(rendered.container.querySelector('a[href="/admin/console/billing-completeness"]')).not.toBeNull();
    expect(rendered.container.querySelector('button[type="submit"]')).toBeNull();
    rendered.cleanup();
  });

  it('isolates source failures; true recorded zero does not turn unavailable finance into zero', async () => {
    api.overview.mockResolvedValue({ suspendedUserCount: 0 });
    api.notifications.mockResolvedValue({ period, rollup: { total: 0, pending: 0, sent: 0, failed: 0, read: 0 }, failures: [], limit: 1, nextCursor: null });
    api.applications.mockResolvedValue({ period, total: 0, byStatus: {} });
    api.betaGate.mockRejectedValue(new Error('private provider detail'));
    api.metrics.mockResolvedValue({ recordedFinancials: { ...financial, status: 'unavailable', actualCoveredRange: null, totals: null } });
    const rendered = view(<AdminOverviewPage />);
    await waitForText(rendered.container, 'تعذّر تحميل سعة Beta');
    await waitForText(rendered.container, 'صفر مؤكّد');
    expect(card(rendered.container, 'الإشعارات').textContent).toContain('صفر إشعارات');
    expect(card(rendered.container, 'الطلبات').textContent).toContain('صفر طلبات');
    expect(card(rendered.container, 'الإشعارات').querySelector('[data-slot="summary-proportions"]')).toBeNull();
    expect(card(rendered.container, 'الطلبات').querySelector('[data-slot="summary-proportions"]')).toBeNull();
    expect(card(rendered.container, 'توزيع الطلبات').querySelector('figure')).toBeNull();
    expect(card(rendered.container, 'المؤشرات المالية المسجّلة').textContent).toContain('لا يُفترض الصفر');
    expect(card(rendered.container, 'المؤشرات المالية المسجّلة').textContent).not.toContain('$0.00');
    expect(card(rendered.container, 'المؤشرات المالية المسجّلة').querySelector('figure')).toBeNull();
    expect(rendered.container.textContent).not.toContain('private provider detail');
    rendered.cleanup();
  });

  it('keeps resolved cards visible while another source is still loading', async () => {
    api.betaGate.mockReturnValue(new Promise(() => undefined));
    const rendered = view(<AdminOverviewPage />);
    await waitForText(rendered.container, 'حسابات في حالة تعليق صريحة');
    expect(card(rendered.container, 'سعة قبول Beta').textContent).toContain('جارٍ تحميل');
    expect(card(rendered.container, 'الإشعارات').textContent).toContain('الإجمالي');
    expect(card(rendered.container, 'المؤشرات المالية المسجّلة').textContent).toContain('تغطية كاملة');
    rendered.cleanup();
  });

  it('shows partial covered values and withholds totals whenever evidence is unresolved', async () => {
    api.metrics.mockResolvedValue({ recordedFinancials: { ...financial, status: 'partial', totals: { ...amounts, grossRevenueMinor: 2500, recordedNetRevenueMinor: 2500, estimatedContributionMarginMicroUsd: 25_000_000 }, daily: [{ day: '2026-10-08', coverage: 'partial', ...amounts, grossRevenueMinor: 2500, recordedNetRevenueMinor: 2500, estimatedContributionMarginMicroUsd: 25_000_000 }] } });
    const partial = view(<AdminOverviewPage />);
    await waitForText(partial.container, 'تغطية جزئية');
    expect(card(partial.container, 'المؤشرات المالية المسجّلة').textContent).toContain('الفترة المغطاة');
    expect(card(partial.container, 'المؤشرات المالية المسجّلة').textContent).toContain('$25.00');
    expect(card(partial.container, 'المؤشرات المالية المسجّلة').textContent).toContain('لا تمثل كامل النطاق');
    expect(card(partial.container, 'المؤشرات المالية المسجّلة').querySelector('tbody tr')?.textContent).toContain('جزئي');
    partial.cleanup();

    api.metrics.mockResolvedValue({ recordedFinancials: { ...financial, status: 'unresolved', totals: { ...amounts, grossRevenueMinor: 2500 } } });
    const unresolved = view(<AdminOverviewPage />);
    await waitForText(unresolved.container, 'أدلة غير محسومة');
    expect(card(unresolved.container, 'المؤشرات المالية المسجّلة').textContent).toContain('الإجماليات محجوبة');
    expect(card(unresolved.container, 'المؤشرات المالية المسجّلة').textContent).not.toContain('$25.00');
    expect(card(unresolved.container, 'المؤشرات المالية المسجّلة').querySelector('figure')).toBeNull();
    unresolved.cleanup();
  });

  it('plots only authoritative current application-status counts, with a textual alternative', async () => {
    api.applications.mockResolvedValue({ period, total: 5, byStatus: { applied: 3, interview: 2, offer: 0 } });
    const rendered = view(<AdminOverviewPage />);
    await waitForText(rendered.container, 'applied');
    const chart = card(rendered.container, 'توزيع الطلبات').querySelector('figure');
    expect(chart?.getAttribute('aria-label')).toContain('الحالات الحالية');
    const rows = Array.from(chart?.querySelectorAll('li') ?? []);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('applied');
    expect(rows[0]?.textContent).toContain('3');
    expect(rows[1]?.textContent).toContain('interview');
    expect(rows[1]?.textContent).toContain('2');
    const segments = Array.from(chart?.querySelectorAll('svg circle[stroke-dasharray]') ?? []);
    expect(segments).toHaveLength(2);
    expect(Number(segments[0]?.getAttribute('stroke-dasharray')?.split(' ')[0])).toBeCloseTo(0.6 * 2 * Math.PI * 36);
    expect(Number(segments[1]?.getAttribute('stroke-dasharray')?.split(' ')[0])).toBeCloseTo(0.4 * 2 * Math.PI * 36);
    expect(chart?.textContent).not.toContain('offer');
    const center = chart?.querySelector('[data-slot="application-donut-center"]');
    expect(center?.querySelector('bdi')?.className).toContain('text-[0.5rem]');
    expect(center?.querySelector('span')?.className).toContain('text-[0.5rem]');
    expect(center?.querySelector('bdi')?.textContent).toBe('5');
    rendered.cleanup();
  });

  it('shows signed recorded USD cents by real UTC day, with text for zero and partial days', async () => {
    api.metrics.mockResolvedValue({ recordedFinancials: { ...financial, totals: { ...amounts, recordedNetRevenueMinor: 2000, estimatedContributionMarginMicroUsd: 20_000_000 }, daily: [
      { day: '2026-10-07', coverage: 'complete', ...amounts, recordedNetRevenueMinor: 2500 },
      { day: '2026-10-08', coverage: 'partial', ...amounts, recordedNetRevenueMinor: -500 },
      { day: '2026-10-09', coverage: 'partial', ...amounts },
    ] } });
    const rendered = view(<AdminOverviewPage />);
    await waitForText(rendered.container, 'الإيراد الصافي المسجّل · يوميًا');
    const chart = card(rendered.container, 'المؤشرات المالية المسجّلة').querySelector('figure');
    expect(chart?.getAttribute('aria-label')).toContain('حسب اليوم');
    const rows = Array.from(chart?.querySelectorAll('tbody tr') ?? []);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('2026-10-07');
    expect(rows[0]?.textContent).toContain('$25.00');
    expect(rows[1]?.textContent).toContain('2026-10-08');
    expect(rows[1]?.textContent).toContain('-$5.00');
    expect(rows[1]?.textContent).toContain('جزئي');
    expect(rows[2]?.textContent).toContain('$0.00');
    await vi.waitFor(() => expect(chart?.querySelectorAll('svg circle[data-day]')).toHaveLength(3));
    const markers = Array.from(chart?.querySelectorAll('svg circle[data-day]') ?? []);
    expect(markers.map((marker) => [marker.getAttribute('data-day'), marker.getAttribute('data-minor'), marker.getAttribute('data-coverage')])).toEqual([
      ['2026-10-07', '2500', 'complete'], ['2026-10-08', '-500', 'partial'], ['2026-10-09', '0', 'partial'],
    ]);
    expect(markers[1]?.getAttribute('fill')).toBe('white');
    expect(Number(markers[1]?.getAttribute('cy'))).toBeGreaterThan(Number(markers[2]?.getAttribute('cy')));
    expect(Number(markers[0]?.getAttribute('cy'))).toBeLessThan(Number(markers[2]?.getAttribute('cy')));
    expect(chart?.querySelector('path.recharts-area-curve')?.getAttribute('d')?.match(/[MC]/g)).toHaveLength(3);
    expect(chart?.querySelector('svg.recharts-surface')?.getAttribute('role')).toBe('application');
    expect(chart?.querySelector('svg.recharts-surface')?.getAttribute('tabindex')).toBe('0');
    expect(chart?.querySelector('summary')?.textContent).toContain('القيم اليومية الدقيقة');
    const surface = chart?.querySelector<SVGElement>('svg.recharts-surface');
    await act(async () => {
      surface?.focus();
    });
    await vi.waitFor(() => {
      const tooltip = chart?.querySelector('.recharts-tooltip-wrapper');
      expect(tooltip?.textContent).toContain('2026-10-07 UTC');
      expect(tooltip?.textContent).toContain('$25.00');
      expect(tooltip?.textContent).toContain('كامل');
    });
    await act(async () => { surface?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    await vi.waitFor(() => {
      const tooltip = chart?.querySelector('.recharts-tooltip-wrapper');
      expect(tooltip?.textContent).toContain('2026-10-08 UTC');
      expect(tooltip?.textContent).toContain('-$5.00');
      expect(tooltip?.textContent).toContain('جزئي');
    });
    expect(chart?.querySelector('[data-active-coverage="partial"]')?.getAttribute('fill')).toBe('white');
    const primary = card(rendered.container, 'المؤشرات المالية المسجّلة').querySelector('[data-slot="recorded-revenue-primary"]');
    expect(primary?.textContent).toContain('$20.00');
    expect(primary?.textContent).not.toContain('Current Balance');
    expect(chart?.textContent).not.toContain('Today’s Sales');
    expect(chart?.textContent).not.toContain('12.7%');
    rendered.cleanup();
  });

  it('adds only proportional summary bars from authoritative capacity and category counts, not fake trends', async () => {
    api.applications.mockResolvedValue({ period, total: 5, byStatus: { submitted: 3, interview: 2 } });
    const rendered = view(<AdminOverviewPage />);
    await waitForText(rendered.container, '42 / 100');
    await waitForText(card(rendered.container, 'الطلبات'), 'حالاتها الحالية');
    const betaBar = card(rendered.container, 'سعة قبول Beta').querySelector<HTMLElement>('[data-slot="summary-proportions"]');
    expect(betaBar?.getAttribute('aria-hidden')).toBe('true');
    expect((betaBar?.firstElementChild as HTMLElement).style.width).toBe('42%');
    const notificationParts = Array.from(card(rendered.container, 'الإشعارات').querySelectorAll<HTMLElement>('[data-slot="summary-proportions"] > div'));
    expect(notificationParts.map((part) => part.getAttribute('data-value'))).toEqual(['2', '1']);
    expect(parseFloat(notificationParts[0].style.width)).toBeCloseTo(2 / 3 * 100);
    expect(parseFloat(notificationParts[1].style.width)).toBeCloseTo(1 / 3 * 100);
    const applicationParts = Array.from(card(rendered.container, 'الطلبات').querySelectorAll<HTMLElement>('[data-slot="summary-proportions"] > div'));
    expect(applicationParts.map((part) => [part.getAttribute('data-value'), part.style.width])).toEqual([['3', '60%'], ['2', '40%']]);
    // A standalone suspended count has no denominator and must not get a fake ratio.
    expect(card(rendered.container, 'المستخدمون المعلّقون').querySelector('[data-slot="summary-proportions"]')).toBeNull();
    expect(api.applications).toHaveBeenCalledTimes(1);
    expect(api.notifications).toHaveBeenCalledTimes(1);
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(api.retryVerifiedWebhook).not.toHaveBeenCalled();
    rendered.cleanup();
  });

  it('retries only the failed card with a keyboard-focusable control', async () => {
    api.notifications.mockRejectedValueOnce(new Error('secret failure')).mockResolvedValueOnce({ period, rollup: { total: 0, pending: 0, sent: 0, failed: 0, read: 0 }, failures: [], limit: 1, nextCursor: null });
    const rendered = view(<AdminOverviewPage />);
    await waitForText(rendered.container, 'تعذّر تحميل الإشعارات');
    const notifications = card(rendered.container, 'الإشعارات');
    const retry = notifications.querySelector<HTMLButtonElement>('button');
    expect(retry?.textContent).toBe('إعادة المحاولة');
    expect(retry?.getAttribute('class')).toContain('focus-visible');
    expect(notifications.querySelector('[role="alert"]')).not.toBeNull();
    retry?.focus();
    expect(document.activeElement).toBe(retry);
    click(retry!);
    await waitForText(notifications, 'صفر إشعارات');
    expect(api.notifications).toHaveBeenCalledTimes(2);
    expect(api.overview).toHaveBeenCalledTimes(1);
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(rendered.container.textContent).not.toContain('secret failure');
    rendered.cleanup();
  });

  it('shows a genuine covered financial zero but not an offsetting nonzero result', async () => {
    const zero = view(<AdminOverviewPage />);
    await waitForText(zero.container, 'صفر مبالغ مسجّلة');
    zero.cleanup();
    api.metrics.mockResolvedValue({ recordedFinancials: { ...financial, totals: { ...amounts, grossRevenueMinor: 1000, refundAdjustmentMinor: -1000 } } });
    const offset = view(<AdminOverviewPage />);
    await waitForText(offset.container, 'تغطية كاملة');
    expect(card(offset.container, 'المؤشرات المالية المسجّلة').textContent).not.toContain('صفر مبالغ مسجّلة');
    offset.cleanup();
  });

  it('labels a partial local webhook page without turning it into an incident total', async () => {
    api.verifiedWebhooks.mockResolvedValue({ coverage: 'partial', coverageStartAt: period.from, requestedRange: period, coveredRange: period, asOf: financial.asOf, items: [], limit: 3, nextCursor: 'opaque-next-page' });
    const rendered = view(<AdminOverviewPage />);
    await waitForText(rendered.container, 'نطاق الالتقاط جزئي');
    const issues = card(rendered.container, 'مشكلات Webhook الموثّقة');
    expect(issues.textContent).toContain('لا توجد مشكلات ملتقطة في هذه الصفحة المحدودة');
    expect(issues.textContent).not.toContain('opaque-next-page');
    expect(issues.textContent).not.toContain('إجمالي الحوادث: 0');
    rendered.cleanup();
  });

  it('keeps the feature flag and backend authorization boundary independent of the shell label', () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'false');
    const rendered = view(<AdminConsoleShell><p>private overview</p></AdminConsoleShell>);
    expect(rendered.container.textContent).toContain('Admin Console unavailable');
    expect(rendered.container.textContent).toContain('Operations workspace');
    expect(rendered.container.querySelector('img[alt="ApplyAI"]')?.getAttribute('src')).toContain('applyai-logo.png');
    expect(rendered.container.textContent).not.toContain('private overview');
    expect(rendered.container.textContent).not.toContain('Read-only');
    rendered.cleanup();
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'true');
    const enabled = view(<AdminConsoleShell><p>overview child</p></AdminConsoleShell>);
    const current = enabled.container.querySelector('a[aria-current="page"]');
    expect(current?.getAttribute('href')).toBe('/admin/console/overview');
    expect(current?.getAttribute('class')).toContain('focus-visible');
    expect(enabled.container.textContent).toContain('overview child');
    enabled.cleanup();
  });

  it('switches Admin shell and Overview copy among English, French, and Arabic without changing reads', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'true');
    const rendered = view(<AdminConsoleShell><AdminOverviewPage /></AdminConsoleShell>);
    await waitForText(rendered.container, 'Operations overview');
    await waitForText(rendered.container, '42 / 100');
    const calls = api.betaGate.mock.calls.length;
    const french = rendered.container.querySelector<HTMLButtonElement>('button[lang="fr"]');
    expect(french?.getAttribute('aria-pressed')).toBe('false');
    click(french!);
    await waitForText(rendered.container, 'Vue d’ensemble des opérations');
    expect(rendered.container.querySelector('[lang="fr"][dir="ltr"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain('Capacité bêta');
    expect(rendered.container.textContent).toContain('Couverture complète');
    expect(french?.getAttribute('aria-pressed')).toBe('true');
    expect(api.betaGate).toHaveBeenCalledTimes(calls);

    click(rendered.container.querySelector<HTMLButtonElement>('button[lang="ar"]')!);
    await waitForText(rendered.container, 'نظرة عامة على العمليات');
    expect(rendered.container.querySelector('[lang="ar"][dir="rtl"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain('سعة قبول Beta');
    expect(window.localStorage.getItem('applyai-admin-locale')).toBe('ar');
    rendered.cleanup();
  });

  it('keeps existing Admin pages in their original English copy until those pages are localized', () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'true');
    window.localStorage.setItem('applyai-admin-locale', 'ar');
    route.pathname = '/admin/console/metrics';
    const rendered = view(<AdminConsoleShell><p>Original metrics content</p></AdminConsoleShell>);
    expect(rendered.container.querySelector('[lang="en"][dir="ltr"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain('Original metrics content');
    expect(rendered.container.textContent).toContain('Financial checks');
    expect(rendered.container.querySelector('button[lang="fr"]')).toBeNull();
    rendered.cleanup();
  });

  it('uses reusable presentation surfaces without adding charts, actions, or navigation destinations', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'true');
    const rendered = view(<AdminConsoleShell><AdminOverviewPage /></AdminConsoleShell>);
    await waitForText(rendered.container, '42 / 100');
    expect(rendered.container.querySelectorAll('[data-slot="overview-card"]')).toHaveLength(7);
    expect(rendered.container.querySelectorAll('figure')).toHaveLength(2);
    expect(rendered.container.querySelectorAll('[data-slot="overview-chart"]')).toHaveLength(2);
    expect(Array.from(rendered.container.querySelectorAll('nav a')).map((link) => link.getAttribute('href'))).toEqual([
      '/admin/console/overview', '/admin/console/users', '/admin/console/activity-logs',
      '/admin/console/metrics', '/admin/console/billing-completeness', '/admin/console/verified-webhooks',
      '/admin/console/jobs', '/admin/console/resume-failures', '/admin/console/beta-gate',
      '/admin/console/notifications', '/admin/console/applications',
    ]);
    expect(Array.from(rendered.container.querySelectorAll('main a')).map((link) => link.getAttribute('href'))).toEqual([
      '/admin/console/metrics', '/admin/console/billing-completeness', '/admin/console/verified-webhooks',
    ]);
    expect(rendered.container.querySelector('img[alt="ApplyAI"]')?.getAttribute('src')).toContain('applyai-logo.png');
    expect(rendered.container.querySelector('[lang="en"]')?.className).not.toContain('font-');
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(api.retryVerifiedWebhook).not.toHaveBeenCalled();
    rendered.cleanup();
  });

  it('confines the white canvas and divided summary band to main content, leaving the shell navigation unchanged', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'true');
    const shell = view(<AdminConsoleShell><p>Existing main content</p></AdminConsoleShell>);
    const navigation = shell.required('#admin-navigation').outerHTML;
    shell.cleanup();
    const rendered = view(<AdminConsoleShell><AdminOverviewPage /></AdminConsoleShell>);
    await waitForText(rendered.container, '42 / 100');
    expect(rendered.required('#admin-navigation').outerHTML).toBe(navigation);
    expect(rendered.container.querySelector('#admin-navigation [data-slot="overview-canvas"]')).toBeNull();
    const canvas = rendered.required('main [data-slot="overview-canvas"]');
    expect(canvas.className).toContain('bg-white');
    expect(canvas.className).not.toContain('font-');
    expect(canvas.getAttribute('lang')).toBe('en');
    const band = rendered.required('[data-slot="overview-summary-band"]');
    expect(band.children).toHaveLength(2);
    expect(band.firstElementChild?.getAttribute('aria-label')).toBe('Beta capacity');
    expect(Array.from(band.querySelectorAll('[data-slot="overview-card"]')).map((item) => item.getAttribute('aria-label'))).toEqual([
      'Beta capacity', 'Suspended users', 'Notifications', 'Applications',
    ]);
    expect(band.className).toContain('xl:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]');
    expect(card(band, 'Beta capacity').querySelector('strong')?.className).toContain('sm:text-[48px]');
    const supporting = rendered.required('[data-slot="overview-supporting-metrics"]');
    expect(supporting.children).toHaveLength(3);
    expect(supporting.className).toContain('sm:grid-cols-3');
    for (const item of Array.from(band.querySelectorAll('[data-slot="overview-card"]'))) {
      expect(item.className).toContain('rounded-none');
      expect(item.className).toContain('shadow-none');
    }
    expect(rendered.required('[data-slot="overview-detail-columns"]').className).toContain('xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]');
    expect(canvas.querySelectorAll('figure')).toHaveLength(2);
    expect(Array.from(canvas.querySelectorAll('figure figcaption')).map((item) => item.textContent)).toEqual([
      'Recorded Net Revenue · dailyUSD from recorded USD cents',
      'Current statuses of applications created in the 30-day window, not historical funnel transitions',
    ]);
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(api.retryVerifiedWebhook).not.toHaveBeenCalled();
    rendered.cleanup();
  });

  it('retains resolved values during a same-key refresh without changing source windows', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rendered = renderView(<QueryClientProvider client={client}><AdminOverviewPage /></QueryClientProvider>);
    await waitForText(rendered.container, '42 / 100');
    await waitForText(rendered.container, 'تغطية كاملة');
    let finish!: (value: unknown) => void;
    api.metrics.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    let refreshed!: Promise<void>;
    await act(async () => { refreshed = client.refetchQueries({ queryKey: ['admin-console', 'metrics'] }); });
    await waitForText(card(rendered.container, 'المؤشرات المالية المسجّلة'), 'جارٍ تحديث');
    expect(card(rendered.container, 'المؤشرات المالية المسجّلة').textContent).toContain('$0.00');
    expect(card(rendered.container, 'سعة قبول Beta').textContent).toContain('42 / 100');
    expect(api.metrics.mock.calls[1][0]).toEqual(api.metrics.mock.calls[0][0]);
    await act(async () => {
      finish({ recordedFinancials: { ...financial, status: 'unresolved', totals: null } });
      await refreshed;
    });
    await waitForText(card(rendered.container, 'المؤشرات المالية المسجّلة'), 'أدلة غير محسومة');
    expect(card(rendered.container, 'المؤشرات المالية المسجّلة').textContent).not.toContain('$0.00');
    expect(card(rendered.container, 'المؤشرات المالية المسجّلة').querySelector('figure')).toBeNull();
    rendered.cleanup();
  });

  it('refreshes seeded counts on remount and refocus through a shared production-default client', async () => {
    at('2026-10-10T12:00:00.000Z');
    const client = new QueryClient({ defaultOptions: { queries: {
      staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: false, gcTime: Infinity,
    } } });
    const betaValue = (count: number) => ({ enabled: true, registrationCount: count,
      capacity: 100, remainingSlots: 100 - count, status: 'open', updatedAt: new Date().toISOString() });
    client.setQueryData(['admin-console', 'beta-gate'], betaValue(11));
    client.setQueryData(['admin-console', 'overview'], { suspendedUserCount: 1 });
    const firstBeta = deferred<ReturnType<typeof betaValue>>();
    const firstCount = deferred<{ suspendedUserCount: number }>();
    api.betaGate.mockImplementationOnce(() => firstBeta.promise);
    api.overview.mockImplementationOnce(() => firstCount.promise);
    const first = withClient(client);
    await vi.waitFor(() => expect(api.betaGate).toHaveBeenCalledTimes(1));
    expect(card(first.container, 'سعة قبول Beta').textContent).toContain('11 / 100');
    expect(card(first.container, 'سعة قبول Beta').textContent).toContain('جارٍ تحديث');
    expect(card(first.container, 'المستخدمون المعلّقون').textContent).toContain('جارٍ تحديث');
    await act(async () => { firstBeta.resolve(betaValue(50)); firstCount.resolve({ suspendedUserCount: 8 }); });
    await waitForText(card(first.container, 'سعة قبول Beta'), '50 / 100');
    await vi.waitFor(() => expect(card(first.container, 'المستخدمون المعلّقون').querySelector('strong')?.textContent).toBe('8'));
    first.cleanup();

    vi.setSystemTime(new Date('2026-10-10T12:01:00.000Z'));
    const remountBeta = deferred<ReturnType<typeof betaValue>>();
    const remountCount = deferred<{ suspendedUserCount: number }>();
    api.betaGate.mockImplementationOnce(() => remountBeta.promise);
    api.overview.mockImplementationOnce(() => remountCount.promise);
    const second = withClient(client);
    await vi.waitFor(() => expect(api.betaGate).toHaveBeenCalledTimes(2));
    expect(api.overview).toHaveBeenCalledTimes(2);
    expect(card(second.container, 'سعة قبول Beta').textContent).toContain('50 / 100');
    expect(card(second.container, 'سعة قبول Beta').textContent).toContain('جارٍ تحديث');
    await act(async () => { remountBeta.resolve(betaValue(66)); remountCount.resolve({ suspendedUserCount: 7 }); });
    await waitForText(card(second.container, 'سعة قبول Beta'), '66 / 100');
    await vi.waitFor(() => expect(card(second.container, 'المستخدمون المعلّقون').querySelector('strong')?.textContent).toBe('7'));

    act(() => focusManager.setFocused(false));
    vi.setSystemTime(new Date('2026-10-10T12:07:00.000Z'));
    const focusBeta = deferred<ReturnType<typeof betaValue>>();
    const focusCount = deferred<{ suspendedUserCount: number }>();
    api.betaGate.mockImplementationOnce(() => focusBeta.promise);
    api.overview.mockImplementationOnce(() => focusCount.promise);
    const otherReads = [api.notifications, api.applications, api.metrics, api.verifiedWebhooks].map((read) => read.mock.calls.length);
    await act(async () => focusManager.setFocused(true));
    await vi.waitFor(() => expect(api.betaGate).toHaveBeenCalledTimes(3));
    expect(api.overview).toHaveBeenCalledTimes(3);
    await waitForText(card(second.container, 'سعة قبول Beta'), 'جارٍ تحديث');
    await waitForText(card(second.container, 'المستخدمون المعلّقون'), 'جارٍ تحديث');
    await act(async () => { focusBeta.resolve(betaValue(70)); focusCount.resolve({ suspendedUserCount: 9 }); });
    await waitForText(card(second.container, 'سعة قبول Beta'), '70 / 100');
    await vi.waitFor(() => expect(card(second.container, 'المستخدمون المعلّقون').querySelector('strong')?.textContent).toBe('9'));
    expect([api.notifications, api.applications, api.metrics, api.verifiedWebhooks].map((read) => read.mock.calls.length)).toEqual(otherReads);
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(api.retryVerifiedWebhook).not.toHaveBeenCalled();
    second.cleanup(); client.clear();
  });

  it.each([
    ['notifications', 'الإشعارات', 1],
    ['applications', 'الطلبات', 30],
  ] as const)('rolls the %s creation window on a later retry without showing old-window data', async (method, title, days) => {
    at('2026-10-10T09:30:00.000Z');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const next = deferred<unknown>();
    api[method].mockRejectedValueOnce(new Error('synthetic failure')).mockImplementationOnce(() => next.promise);
    const rendered = withClient(client);
    await waitForText(card(rendered.container, title), 'تعذّر تحميل');
    const original = api[method].mock.calls[0][0];
    const now = '2026-10-10T14:30:00.000Z';
    vi.setSystemTime(new Date(now));
    click(card(rendered.container, title).querySelector<HTMLButtonElement>('button')!);
    await vi.waitFor(() => expect(api[method]).toHaveBeenCalledTimes(2));
    const current = api[method].mock.calls[1][0];
    expect(current.createdTo).toBe(now);
    expect(current.createdFrom).toBe(new Date(Date.parse(now) - days * 86_400_000).toISOString());
    expect(current).not.toEqual(original);
    expect(client.getQueryCache().findAll({ queryKey: ['admin-console', method] }).map((query) => query.queryKey[2])).toEqual(expect.arrayContaining([original, current]));
    expect(card(rendered.container, title).textContent).toContain('جارٍ تحميل');
    expect(card(rendered.container, title).querySelector('strong')).toBeNull();
    const currentPeriod = { from: current.createdFrom, to: current.createdTo };
    await act(async () => next.resolve(method === 'notifications'
      ? { period: currentPeriod, rollup: { total: 37, sent: 36, failed: 1 }, failures: [], limit: 1, nextCursor: null }
      : { period: currentPeriod, total: 37, byStatus: { applied: 37 } }));
    await vi.waitFor(() => expect(card(rendered.container, title).querySelector('strong')?.textContent).toBe('37'));
    expect(card(rendered.container, title).querySelector('[title]')?.getAttribute('title')).toBe(`${current.createdFrom} → ${current.createdTo}`);
    expect(card(rendered.container, 'سعة قبول Beta').textContent).toContain('42 / 100');
    expect(api.betaGate).toHaveBeenCalledTimes(1);
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(api.retryVerifiedWebhook).not.toHaveBeenCalled();
    rendered.cleanup(); client.clear();
  });

  it.each([
    ['metrics', 'المؤشرات المالية المسجّلة'],
    ['verifiedWebhooks', 'مشكلات Webhook الموثّقة'],
  ] as const)('rolls the %s UTC calendar window across midnight on retry', async (method, title) => {
    at('2026-10-10T23:59:00.000Z');
    const next = deferred<unknown>();
    api[method].mockRejectedValueOnce(new Error('synthetic failure')).mockImplementationOnce(() => next.promise);
    const rendered = view(<AdminOverviewPage />);
    await waitForText(card(rendered.container, title), 'تعذّر تحميل');
    expect(api[method].mock.calls[0][0]).toEqual(expect.objectContaining({ from: '2026-10-04', to: '2026-10-10' }));
    const now = '2026-10-11T00:01:00.000Z';
    vi.setSystemTime(new Date(now));
    click(card(rendered.container, title).querySelector<HTMLButtonElement>('button')!);
    await vi.waitFor(() => expect(api[method]).toHaveBeenCalledTimes(2));
    expect(api[method].mock.calls[1][0]).toEqual(expect.objectContaining({ from: '2026-10-05', to: '2026-10-11' }));
    expect(card(rendered.container, title).textContent).toContain('2026-10-05');
    expect(card(rendered.container, title).textContent).toContain('2026-10-11');
    expect(card(rendered.container, title).textContent).toContain('جارٍ تحميل');
    expect(card(rendered.container, title).querySelector('figure, dl, ul')).toBeNull();
    await act(async () => next.resolve(method === 'metrics'
      ? { recordedFinancials: { ...financial, status: 'partial', asOf: now,
        actualCoveredRange: { from: '2026-10-05T00:00:00.000Z', toExclusive: now },
        totals: { ...amounts, recordedNetRevenueMinor: 7350 }, daily: [] } }
      : { coverage: 'partial', asOf: now, items: [], limit: 3, nextCursor: null }));
    await waitForText(card(rendered.container, title), now);
    if (method === 'metrics') expect(card(rendered.container, title).textContent).toContain('$73.50');
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(api.retryVerifiedWebhook).not.toHaveBeenCalled();
    rendered.cleanup();
  });

  it('keeps a late earlier-window result out of the current result after navigation and retry', async () => {
    at('2026-10-10T23:50:00.000Z');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const old = deferred<unknown>();
    const latest = deferred<unknown>();
    api.metrics.mockImplementationOnce(() => old.promise)
      .mockRejectedValueOnce(new Error('synthetic failure'))
      .mockImplementationOnce(() => latest.promise);
    const first = withClient(client);
    await vi.waitFor(() => expect(api.metrics).toHaveBeenCalledTimes(1));
    const oldParams = api.metrics.mock.calls[0][0];
    first.cleanup();
    vi.setSystemTime(new Date('2026-10-11T00:10:00.000Z'));
    const current = withClient(client);
    await waitForText(card(current.container, 'المؤشرات المالية المسجّلة'), 'تعذّر تحميل');
    const now = '2026-10-12T00:10:00.000Z';
    vi.setSystemTime(new Date(now));
    click(card(current.container, 'المؤشرات المالية المسجّلة').querySelector<HTMLButtonElement>('button')!);
    await vi.waitFor(() => expect(api.metrics).toHaveBeenCalledTimes(3));
    const currentParams = { from: '2026-10-06', to: '2026-10-12' };
    expect(api.metrics.mock.calls[2][0]).toEqual(currentParams);
    const currentResponse = { recordedFinancials: { ...financial, status: 'partial', asOf: now,
      actualCoveredRange: { from: '2026-10-06T00:00:00.000Z', toExclusive: now },
      totals: { ...amounts, recordedNetRevenueMinor: 9000 }, daily: [] } };
    await act(async () => latest.resolve(currentResponse));
    await waitForText(card(current.container, 'المؤشرات المالية المسجّلة'), '$90.00');
    const oldResponse = { recordedFinancials: { ...financial, totals: { ...amounts, recordedNetRevenueMinor: 1000 } } };
    await act(async () => old.resolve(oldResponse));
    await vi.waitFor(() => expect(client.getQueryData(['admin-console', 'metrics', oldParams])).toEqual(oldResponse));
    expect(client.getQueryData(['admin-console', 'metrics', currentParams])).toEqual(currentResponse);
    const financialCard = card(current.container, 'المؤشرات المالية المسجّلة');
    expect(financialCard.textContent).toContain('$90.00');
    expect(financialCard.textContent).not.toContain('$10.00');
    expect(financialCard.textContent).toContain(now);
    expect(financialCard.textContent).toContain('2026-10-06');
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(api.retryVerifiedWebhook).not.toHaveBeenCalled();
    current.cleanup(); client.clear();
  });

  it.each([
    ['eligible', 'retryable', true, 'none', 'قابلة لطلب إعادة المحاولة'],
    ['inspection-only', 'retryable', false, 'none', 'للفحص فقط؛ غير مؤهّلة لطلب إعادة المحاولة'],
    ['requested', 'retryable', false, 'pending', 'طُلبت إعادة المحاولة؛ النتيجة لم تُحسم'],
    ['processed', 'retryable', false, 'processed', 'سُجّلت معالجة إعادة المحاولة؛ افحص النتيجة'],
    ['review', 'retryable', false, 'needs_review', 'طلب إعادة المحاولة يحتاج إلى مراجعة'],
    ['resolved', 'resolved', false, 'processed', 'حُلّت'],
  ] as const)('labels a %s webhook from explicit retry eligibility and outcome without offering an action', async (id, status, retryEligible, retryStatus, label) => {
    const row = { eventType: 'invoice.payment_succeeded', status: 'retryable', retryEligible: false,
      retryStatus: 'none', observedAt: financial.asOf, reason: 'provider_unavailable', finishedAt: financial.asOf, resolvedAt: null };
    api.verifiedWebhooks.mockResolvedValue({ coverage: 'partial', asOf: financial.asOf, items: [
      { ...row, id, status, retryEligible, retryStatus, resolvedAt: status === 'resolved' ? financial.asOf : null },
    ], limit: 3, nextCursor: null });
    const rendered = view(<AdminOverviewPage />);
    await waitForText(card(rendered.container, 'مشكلات Webhook الموثّقة'), label);
    const rows = Array.from(card(rendered.container, 'مشكلات Webhook الموثّقة').querySelectorAll('li'));
    expect(rows.map((item) => item.querySelector('span')?.textContent)).toEqual([label]);
    if (status !== 'resolved') expect(rows[0].textContent).not.toContain('حُلّت');
    if (!retryEligible) expect(rows[0].textContent).not.toContain('قابلة لطلب إعادة المحاولة');
    expect(card(rendered.container, 'مشكلات Webhook الموثّقة').querySelector('button')).toBeNull();
    expect(api.verifiedWebhooks).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
    expect(api.retryVerifiedWebhook).not.toHaveBeenCalled();
    rendered.cleanup();
  });
});

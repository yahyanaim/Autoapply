import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, renderView, setFormValue } from '@/test/render';
import { AdminApplicationsPage, AdminBetaGatePage, AdminNotificationsPage } from './AdminReadOperationsPages';
import { AdminLocaleProvider, type AdminLocale } from './AdminLocale';
import { adminReadOperationsCopy } from './AdminReadOperationsCopy';
import { AdminConsoleShell } from './AdminConsoleShell';

const api = vi.hoisted(() => ({ betaGate: vi.fn(), notifications: vi.fn(), applications: vi.fn(), billingCompleteness: vi.fn(), issueStepUp: vi.fn() }));
vi.mock('@/lib/api/admin-api-client', () => ({ adminApiClient: { adminConsole: api } }));
vi.mock('@/lib/api/hooks/use-auth', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/console/notifications' }));

const period = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z' };
const gate = { enabled: true, registrationCount: 40, capacity: 100, remainingSlots: 60, status: 'open', updatedAt: period.to };
const notification = { period, rollup: { total: 5, pending: 0, sent: 3, failed: 2, read: 0 }, failures: [{ id: 'local-1', channel: 'email', createdAt: period.to }], limit: 20, nextCursor: null };
function view(node: React.ReactNode, locale: AdminLocale = 'en') {
  return renderView(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminLocaleProvider initialLocale={locale} persist={false}>{node}</AdminLocaleProvider></QueryClientProvider>);
}
async function text(container: Element, value: string) { await vi.waitFor(() => expect(container.textContent).toContain(value)); }
function button(container: Element, label: string) {
  const result = Array.from(container.querySelectorAll('button')).find(item => item.textContent === label);
  if (!result) throw new Error(`Missing ${label}`);
  return result;
}
describe('Step 5.2 approved read-only pages', () => {
  // Prepare the real lazy renderer independently of Vite's cold module-transform
  // timing. Assertions below still exercise next/dynamic and actual Recharts SVG.
  beforeAll(async () => { await import('./AdminReadOperationsChart'); });
  beforeEach(() => {
    vi.clearAllMocks(); vi.unstubAllEnvs(); window.localStorage.clear();
    api.betaGate.mockResolvedValue(gate);
    api.notifications.mockResolvedValue(notification);
    api.applications.mockResolvedValue({ period, total: 4, byStatus: { draft: 0, submitted: 4 } });
  });
  it.each(['ar', 'en', 'fr'] as const)('renders accurate %s copy, returned windows and safe projections without scans or mutations', async locale => {
    const copy = adminReadOperationsCopy[locale];
    api.notifications.mockResolvedValue({ ...notification, recipient: 'PRIVATE_RECIPIENT', message: 'PRIVATE_MESSAGE', failures: [{ ...notification.failures[0], payload: 'PRIVATE_PAYLOAD' }] });
    const rendered = view(<><AdminBetaGatePage /><AdminNotificationsPage /><AdminApplicationsPage /></>, locale);
    await text(rendered.container, copy.totalApplications);
    expect(rendered.container.querySelectorAll(`section[lang="${locale}"][dir="${locale === 'ar' ? 'rtl' : 'ltr'}"]`)).toHaveLength(3);
    expect(rendered.container.textContent).toContain(copy.open);
    expect(rendered.container.textContent).toContain(copy.applicationsDetail);
    expect(rendered.container.textContent).toContain(copy.betaTotalHelp);
    expect(rendered.container.textContent).toContain(copy.betaMeterHelp);
    expect(rendered.container.textContent).toContain(copy.notificationTotalHelp);
    expect(rendered.container.textContent).toContain(copy.applicationTotalHelp);
    expect(rendered.container.textContent).toContain(copy.periodHelp);
    const explanations = Array.from(rendered.container.querySelectorAll('p[data-slot="read-explanation"]'));
    for (const expected of [copy.betaExplanation, copy.betaRecordHelp, copy.notificationExplanation, copy.applicationExplanation]) {
      const paragraph = explanations.find(item => item.textContent === expected);
      expect(paragraph).toBeDefined();
      expect(paragraph?.className).not.toMatch(/sr-only|hidden/);
      expect(paragraph?.getAttribute('aria-hidden')).not.toBe('true');
    }
    expect(rendered.container.textContent).toContain(period.from);
    expect(rendered.container.textContent).toContain(period.to);
    expect(rendered.container.textContent).not.toMatch(/PRIVATE_RECIPIENT|PRIVATE_MESSAGE|PRIVATE_PAYLOAD/);
    expect(api.notifications).toHaveBeenCalledWith({ limit: 20 });
    expect(api.applications).toHaveBeenCalledWith({});
    expect(api.billingCompleteness).not.toHaveBeenCalled(); expect(api.issueStepUp).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('canvas')).toBeNull();
    await vi.waitFor(() => expect(rendered.container.querySelectorAll('[data-slot="chart"]')).toHaveLength(2));
    expect(rendered.container.querySelectorAll('[role="meter"]')).toHaveLength(1);
    const figures = Array.from(rendered.container.querySelectorAll('[data-slot="count-distribution"]'));
    expect(figures).toHaveLength(2);
    for (const figure of figures) {
      expect(figure.getAttribute('aria-label')).toContain(period.from);
      expect(figure.getAttribute('aria-label')).toContain(period.to);
      expect(figure.textContent).toContain(copy.count);
      expect(figure.querySelector('figcaption')?.textContent).toBe(copy.chartHelp);
      expect(figure.querySelector('dl')?.compareDocumentPosition(figure.querySelector('[data-slot="chart"]')!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      await vi.waitFor(() => expect(figure.querySelectorAll('.recharts-label-list text').length).toBeGreaterThan(0));
      for (const countLabel of Array.from(figure.querySelectorAll('.recharts-label-list text'))) {
        expect(countLabel.getAttribute('text-anchor')).toBe(locale === 'ar' ? 'end' : 'start');
      }
    }
    const masks = Array.from(rendered.container.querySelectorAll('svg mask')).map(mask => mask.id);
    expect(masks).toHaveLength(2);
    expect(new Set(masks).size).toBe(2);
    for (const summary of Array.from(rendered.container.querySelectorAll('[data-slot="operations-summary"]'))) {
      expect(summary.className).toContain('ring-4');
      expect(summary.className).toContain('border-border');
      expect(summary.className).not.toContain('border-t-primary-500');
      expect(summary.querySelector('[data-slot="primary-value"] dd')?.className).toContain('font-medium');
      expect(summary.querySelector('[data-slot="primary-value"] dd')?.className).toContain('text-foreground');
    }
    // Only the gate uses supporting numeric cells. Notification/application
    // counts are shown once in the chart, with exact accessible alternatives.
    expect(rendered.container.querySelectorAll('[data-slot="statistics-grid"]')).toHaveLength(1);
    expect(rendered.container.querySelectorAll('[data-slot="distribution-summary"]')).toHaveLength(2);
    for (const panel of Array.from(rendered.container.querySelectorAll('[data-slot="read-panel"]'))) {
      expect(panel.querySelector('header')?.className).toContain('border-b');
      expect(panel.querySelector('header')?.className).toContain('border-border/60');
      expect(panel.querySelector('header')?.className).toContain('bg-white');
    }
    rendered.cleanup();
  });
  it.each([
    { registrations: 0, capacity: 100, width: '0%' },
    { registrations: 40, capacity: 100, width: '40%' },
    { registrations: 100, capacity: 100, width: '100%' },
  ])('maps the capacity meter to recorded $registrations / $capacity counts', async ({ registrations, capacity, width }) => {
    api.betaGate.mockResolvedValue({ ...gate, registrationCount: registrations, capacity, remainingSlots: capacity - registrations });
    const rendered = view(<AdminBetaGatePage />);
    await text(rendered.container, 'Registrations');
    const meter = rendered.required<HTMLDivElement>('[role="meter"]');
    expect(meter.getAttribute('aria-label')).toBe('Registrations / Capacity');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe(String(capacity));
    expect(meter.getAttribute('aria-valuenow')).toBe(String(registrations));
    expect(meter.getAttribute('aria-valuetext')).toBe(`Registrations: ${registrations}; Capacity: ${capacity}`);
    expect(meter.querySelector<HTMLElement>('[aria-hidden="true"]')?.style.width).toBe(width);
    expect(rendered.container.textContent).not.toContain('%');
    rendered.cleanup();
  });
  it.each([{ registrations: 0, capacity: 0 }, { registrations: 150, capacity: 100 }])('keeps raw counts when no bounded capacity ratio exists: $registrations / $capacity', async ({ registrations, capacity }) => {
    api.betaGate.mockResolvedValue({ ...gate, registrationCount: registrations, capacity, remainingSlots: 0, status: 'full' });
    const rendered = view(<AdminBetaGatePage />);
    await text(rendered.container, 'Full');
    expect(rendered.container.querySelector('[role="meter"]')).toBeNull();
    const primary = rendered.required('[data-slot="primary-value"] dd');
    expect(primary.textContent).toBe(String(registrations));
    const capacityTerm = Array.from(rendered.container.querySelectorAll('dt')).find(term => term.textContent === 'Capacity');
    expect(capacityTerm?.nextElementSibling?.textContent).toBe(String(capacity));
    rendered.cleanup();
  });
  it('charts whole-window notification states, not failure-page length, with keyboard-accessible exact counts', async () => {
    api.notifications.mockResolvedValue({ ...notification, rollup: { total: 101, pending: 11, sent: 22, failed: 33, read: 35 } });
    const rendered = view(<AdminNotificationsPage />);
    await text(rendered.container, 'local-1');
    const figure = rendered.required('[data-slot="count-distribution"]');
    expect(Array.from(figure.querySelectorAll('dt')).map(term => [term.textContent, term.nextElementSibling?.textContent])).toEqual([['Pending', '11'], ['Sent', '22'], ['Failed', '33'], ['Read', '35']]);
    expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(1);
    await vi.waitFor(() => expect(figure.querySelectorAll('.recharts-bar-rectangle path')).toHaveLength(4));
    await vi.waitFor(() => expect(Array.from(figure.querySelectorAll('.recharts-label-list text')).map(label => label.textContent)).toEqual(['11', '22', '33', '35']));
    expect(figure.querySelector<HTMLElement>('[data-slot="chart"]')?.style.getPropertyValue('--color-count')).toBe('var(--color-primary)');
    const widths = Array.from(figure.querySelectorAll('.recharts-bar-rectangle path')).map(path => Number(path.getAttribute('width')));
    expect(widths[1]).toBeCloseTo(widths[0] * 2);
    expect(widths[2]).toBeCloseTo(widths[0] * 3);
    const expectedColors = ['var(--count-neutral)', 'var(--count-success)', 'var(--count-danger)', 'var(--count-success)'];
    Array.from(figure.querySelectorAll('.recharts-bar-rectangle path')).forEach((bar, index) => {
      const mask = bar.getAttribute('mask');
      expect(mask).toMatch(/^url\(#count-stripes-/);
      expect(figure.querySelector(`mask[id="${mask!.slice(5, -1)}"]`)).not.toBeNull();
      expect(bar.getAttribute('fill')).toBe(expectedColors[index]);
      expect(bar.getAttribute('stroke')).toBe(expectedColors[index]);
    });
    const surface = rendered.required<SVGSVGElement>('svg.recharts-surface');
    expect(surface.getAttribute('role')).toBe('application');
    expect(surface.getAttribute('tabindex')).toBe('0');
    expect(surface.getAttribute('aria-label')).toContain('Count');
    await act(async () => { surface.focus(); });
    await vi.waitFor(() => {
      expect(figure.querySelector('.recharts-tooltip-wrapper')?.textContent).toContain('Pending');
      expect(figure.querySelector('.recharts-tooltip-wrapper')?.textContent).toContain('11');
    });
    // Recharts 3 navigates vertical category charts with Left/Right keys;
    // Left advances the default top-to-bottom category axis.
    await act(async () => { surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    await vi.waitFor(() => {
      expect(figure.querySelector('.recharts-tooltip-wrapper')?.textContent).toContain('Sent');
      expect(figure.querySelector('.recharts-tooltip-wrapper')?.textContent).toContain('22');
    });
    rendered.cleanup();
  });
  it('plots application status counts including text for returned zero categories, never a trend', async () => {
    api.applications.mockResolvedValue({ period, total: 8, byStatus: { draft: 2, submitted: 5, viewed: 0, interview: 1, offer: 0, rejected: 0 } });
    const rendered = view(<AdminApplicationsPage />);
    await text(rendered.container, 'Total applications');
    const figure = rendered.required('[data-slot="count-distribution"]');
    expect(Array.from(figure.querySelectorAll('dt')).map(term => [term.textContent, term.nextElementSibling?.textContent])).toEqual([['Draft', '2'], ['Submitted', '5'], ['Viewed', '0'], ['Interview', '1'], ['Offer', '0'], ['Rejected', '0']]);
    expect(figure.getAttribute('aria-label')).toContain('not historical funnel transitions');
    expect(figure.getAttribute('aria-label')).toContain(period.from);
    expect(figure.getAttribute('aria-label')).toContain(period.to);
    await vi.waitFor(() => expect(figure.querySelectorAll('.recharts-bar-rectangle path')).toHaveLength(3));
    // Recharts draws no rectangle (or end label) for a zero-length bar.
    // Zero categories still have exact, visible values in the unified summary.
    await vi.waitFor(() => expect(Array.from(figure.querySelectorAll('.recharts-label-list text')).map(label => label.textContent)).toEqual(['2', '5', '1']));
    expect(rendered.container.querySelector('[data-slot="statistics-grid"]')).toBeNull();
    expect(figure.querySelector('dl')?.className).toBe('sr-only');
    await vi.waitFor(() => {
      const chartText = figure.querySelector('[data-slot="chart"]')?.textContent;
      expect(chartText).toContain('Viewed · 0');
      expect(chartText).toContain('Offer · 0');
      expect(chartText).toContain('Rejected · 0');
    });
    expect(figure.textContent).toContain('Count');
    expect(figure.textContent).not.toContain('%');
    expect(api.applications).toHaveBeenCalledExactlyOnceWith({});
    rendered.cleanup();
  });
  it('colors actual application states without changing their counts, scale or accessible labels', async () => {
    const byStatus = { draft: 1, submitted: 2, viewed: 1, interview: 3, offer: 2, rejected: 3 };
    api.applications.mockResolvedValue({ period, total: 12, byStatus });
    const rendered = view(<AdminApplicationsPage />);
    await text(rendered.container, 'Total applications');
    const figure = rendered.required('[data-slot="count-distribution"]');
    await vi.waitFor(() => expect(figure.querySelectorAll('.recharts-bar-rectangle path')).toHaveLength(6));
    expect(Array.from(figure.querySelectorAll('.recharts-bar-rectangle path')).map(bar => bar.getAttribute('fill'))).toEqual([
      'var(--count-neutral)', 'var(--color-count)', 'var(--count-neutral)',
      'var(--count-success)', 'var(--count-success)', 'var(--count-danger)',
    ]);
    await vi.waitFor(() => expect(Array.from(figure.querySelectorAll('.recharts-label-list text')).map(label => label.textContent)).toEqual(['1', '2', '1', '3', '2', '3']));
    expect(Array.from(figure.querySelectorAll('dt')).map(term => [term.textContent, term.nextElementSibling?.textContent])).toEqual([
      ['Draft', '1'], ['Submitted', '2'], ['Viewed', '1'], ['Interview', '3'], ['Offer', '2'], ['Rejected', '3'],
    ]);
    const widths = Array.from(figure.querySelectorAll('.recharts-bar-rectangle path')).map(bar => Number(bar.getAttribute('width')));
    expect(widths[1]).toBeCloseTo(widths[0] * 2);
    expect(widths[5]).toBeCloseTo(widths[0] * 3);
    expect(figure.getAttribute('aria-label')).toContain('not historical funnel transitions');
    expect(api.applications).toHaveBeenCalledExactlyOnceWith({});
    rendered.cleanup();
  });
  it.each([
    { status: 'open', label: 'Open', tone: 'success', registrations: 40, remaining: 60, enabled: true },
    { status: 'full', label: 'Full', tone: 'warning', registrations: 100, remaining: 0, enabled: true },
    { status: 'disabled', label: 'Disabled', tone: 'neutral', registrations: 40, remaining: 60, enabled: false },
  ])('keeps $label gate meaning and counts alongside its non-color status cue', async ({ status, label, tone, registrations, remaining, enabled }) => {
    api.betaGate.mockResolvedValue({ ...gate, status, enabled, registrationCount: registrations, remainingSlots: remaining });
    const rendered = view(<AdminBetaGatePage />);
    await text(rendered.container, label);
    const badge = rendered.required('[data-slot="gate-status"]');
    expect(badge.textContent).toBe(label);
    expect(badge.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(badge.className).toContain(tone === 'neutral' ? 'text-muted-foreground' : `text-${tone}-800`);
    expect(rendered.required('[role="meter"]').getAttribute('aria-valuenow')).toBe(String(registrations));
    expect(rendered.required('[data-slot="primary-value"] dd').textContent).toBe(String(registrations));
    const remainingValue = Array.from(rendered.container.querySelectorAll('dt')).find(term => term.textContent === 'Remaining')?.nextElementSibling;
    expect(remainingValue?.textContent).toBe(String(remaining));
    expect(remainingValue?.className).toContain(status === 'open' && remaining > 0 ? 'text-success-800' : 'text-foreground');
    expect(rendered.container.querySelector('[data-slot="card-icon"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(rendered.container.querySelector('[data-slot="card-icon"] svg')).not.toBeNull();
    expect(rendered.container.querySelector('button, input, select')).toBeNull();
    expect(api.betaGate).toHaveBeenCalledTimes(1);
    expect(api.issueStepUp).not.toHaveBeenCalled();
    rendered.cleanup();
  });
  it('keeps the owner values and supporting definitions together in each unified summary', async () => {
    const rendered = view(<><AdminBetaGatePage /><AdminNotificationsPage /><AdminApplicationsPage /></>);
    await text(rendered.container, 'Total applications');
    const summaries = Array.from(rendered.container.querySelectorAll('[data-slot="operations-summary"]'));
    expect(summaries).toHaveLength(3);
    const entries = (summary: Element) => Array.from(summary.querySelectorAll('dt')).map(term => [term.textContent, term.nextElementSibling?.textContent]);
    expect(entries(summaries[0])).toEqual([['Registrations', '40'], ['Capacity', '100'], ['Remaining', '60'], ['Status', 'Open']]);
    expect(entries(summaries[1])).toEqual([['Total', '5'], ['Pending', '0'], ['Sent', '3'], ['Failed', '2'], ['Read', '0']]);
    expect(entries(summaries[2])).toEqual([['Total applications', '4'], ['Draft', '0'], ['Submitted', '4']]);
    expect(summaries.map(summary => summary.querySelector('[data-slot="primary-value"] dd')?.textContent)).toEqual(['40', '5', '4']);
    expect(rendered.container.querySelectorAll('h1')).toHaveLength(3);
    expect(rendered.container.querySelectorAll('table')).toHaveLength(1);
    expect(rendered.container.querySelectorAll('input[type="datetime-local"]')).toHaveLength(2);
    expect(rendered.container.textContent).toContain(`Gate record updated at: ${period.to}`);
    expect(rendered.container.textContent).toContain('not a global incident count');
    expect(rendered.container.textContent).toContain('not historical funnel transitions');
    expect(rendered.container.textContent).toContain(period.from);
    expect(rendered.container.textContent).toContain(period.to);
    expect(api.betaGate).toHaveBeenCalledTimes(1);
    expect(api.notifications).toHaveBeenCalledExactlyOnceWith({ limit: 20 });
    expect(api.applications).toHaveBeenCalledExactlyOnceWith({});
    expect(api.billingCompleteness).not.toHaveBeenCalled();
    expect(api.issueStepUp).not.toHaveBeenCalled();
    rendered.cleanup();
  });
  it('keeps cursor paging semantics and whole-window counts distinct from the failure page', async () => {
    api.notifications.mockImplementation(async (params: {cursor?: string}) => params.cursor ? { ...notification, failures: [{ ...notification.failures[0], id: 'local-2' }] } : { ...notification, nextCursor: 'PRIVATE_CURSOR' });
    const rendered = view(<AdminNotificationsPage />);
    await text(rendered.container, 'local-1'); click(button(rendered.container, 'Next'));
    await text(rendered.container, 'local-2');
    expect(api.notifications).toHaveBeenLastCalledWith({ limit: 20, cursor: 'PRIVATE_CURSOR' });
    const summary = rendered.required('[data-slot="operations-summary"]');
    expect(Array.from(rendered.required('[data-slot="operations-summary"]').querySelectorAll('dd')).map(item => item.textContent)).toEqual(['5', '0', '3', '2', '0']);
    expect(rendered.container.textContent).toContain('not a global incident count');
    expect(rendered.container.textContent).not.toContain('PRIVATE_CURSOR');
    click(button(rendered.container, 'Previous')); await text(rendered.container, 'local-1');
    expect(api.notifications).toHaveBeenLastCalledWith({ limit: 20 });
    expect(Array.from(summary.querySelectorAll('dd')).map(item => item.textContent)).toEqual(['5', '0', '3', '2', '0']);
    rendered.cleanup();
  });
  it('reports a full Beta gate from its owner without enabling controls or treating record update as read asOf', async () => {
    api.betaGate.mockResolvedValue({ ...gate, registrationCount: 100, remainingSlots: 0, status: 'full' });
    const rendered = view(<AdminBetaGatePage />);
    await text(rendered.container, 'Full');
    expect(rendered.container.textContent).toContain(`Gate record updated at: ${period.to}`);
    expect(rendered.container.querySelector('button, input, select')).toBeNull();
    expect(api.issueStepUp).not.toHaveBeenCalled(); rendered.cleanup();
  });
  it.each([AdminBetaGatePage, AdminNotificationsPage, AdminApplicationsPage])('shows loading and safe retry/inaccessible states for %s', async Page => {
    const read = Page === AdminBetaGatePage ? api.betaGate : Page === AdminNotificationsPage ? api.notifications : api.applications;
    read.mockReturnValueOnce(new Promise(() => undefined));
    const loading = view(<Page />); expect(loading.container.querySelector('[role="status"]')?.textContent).toContain('Loading');
    expect(loading.container.querySelector('[data-slot="chart"], [role="meter"], dl')).toBeNull(); loading.cleanup();
    read.mockRejectedValueOnce({ response: { status: 403 }, message: 'PRIVATE_ERROR' });
    const denied = view(<Page />); await text(denied.container, 'Access unavailable');
    expect(denied.container.textContent).not.toContain('PRIVATE_ERROR');
    expect(denied.container.querySelector('[data-slot="chart"], [role="meter"], dl')).toBeNull();
    expect(denied.container.querySelector('[data-slot="read-explanation"], [data-slot="read-panel"], [data-slot="operations-summary"]')).toBeNull();
    const retry = button(denied.container, 'Retry'); retry.focus(); expect(document.activeElement).toBe(retry);
    expect(retry.className).toContain('min-h-11');
    expect(retry.className).toContain('focus-visible:ring-primary-700');
    expect(retry.className).toContain('bg-white');
    expect(retry.className).toContain('text-foreground');
    click(retry); await vi.waitFor(() => expect(denied.container.querySelector('[role="alert"]')).toBeNull());
    denied.cleanup();
  });
  it('distinguishes genuine zero, disabled Beta and source error without inventing timestamps', async () => {
    api.betaGate.mockResolvedValue({ ...gate, enabled: false, status: 'disabled', registrationCount: 0, remainingSlots: 100 });
    api.notifications.mockResolvedValue({ ...notification, failures: [], rollup: { total: 0, pending: 0, sent: 0, failed: 0, read: 0 } });
    api.applications.mockResolvedValue({ period, total: 0, byStatus: { draft: 0 } });
    const rendered = view(<><AdminBetaGatePage /><AdminNotificationsPage /><AdminApplicationsPage /></>);
    await text(rendered.container, 'recorded zero'); expect(rendered.container.textContent).toContain('Beta mode is disabled'); expect(rendered.container.textContent).toContain('No delivery failures');
    expect(rendered.container.querySelector('[data-slot="chart"]')).toBeNull();
    expect(rendered.container.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('0');
    expect(rendered.container.querySelectorAll('[data-slot="count-distribution"] dd')).toHaveLength(5);
    for (const count of Array.from(rendered.container.querySelectorAll('[data-slot="count-distribution"] dd'))) expect(count.textContent).toBe('0');
    for (const counts of Array.from(rendered.container.querySelectorAll('[data-slot="distribution-counts"]'))) expect(counts.className).not.toContain('sr-only');
    rendered.cleanup();
    api.notifications.mockRejectedValue(new Error('PRIVATE_ERROR'));
    const error = view(<AdminNotificationsPage />); await text(error.container, 'No zero value is assumed');
    expect(error.container.querySelector('dl, table, [data-slot="chart"], [role="meter"], [data-slot="read-explanation"], [data-slot="read-panel"]')).toBeNull(); expect(error.container.textContent).not.toContain('PRIVATE_ERROR'); error.cleanup();
  });
  it('preserves local datetime to UTC filters and disables an invalid range without a read', async () => {
    const rendered = view(<AdminApplicationsPage />); await text(rendered.container, 'Total applications');
    const from = rendered.required<HTMLInputElement>('input[aria-label="Created from"]'); const to = rendered.required<HTMLInputElement>('input[aria-label="Created to"]');
    setFormValue(from, '2026-10-03T12:30');
    await vi.waitFor(() => expect(api.applications).toHaveBeenLastCalledWith({ createdFrom: new Date('2026-10-03T12:30').toISOString() }));
    const count = api.applications.mock.calls.length;
    setFormValue(to, '2026-10-02T12:30'); await text(rendered.container, 'Invalid date range'); expect(api.applications).toHaveBeenCalledTimes(count);
    setFormValue(to, '2026-10-04T12:30'); await vi.waitFor(() => expect(api.applications).toHaveBeenLastCalledWith({ createdFrom: new Date('2026-10-03T12:30').toISOString(), createdTo: new Date('2026-10-04T12:30').toISOString() }));
    expect(from.className).toContain('min-h-11'); rendered.cleanup();
  });
  it('keeps gate interpretation and the record timestamp inside its single operational panel', async () => {
    const rendered = view(<AdminBetaGatePage />);
    await text(rendered.container, 'Registrations');
    const summary = rendered.required('[data-slot="operations-summary"]');
    expect(summary.querySelector('[data-slot="gate-context"]')?.textContent).toContain(`Gate record updated at: ${period.to}`);
    expect(summary.textContent).toContain(adminReadOperationsCopy.en.betaExplanation);
    expect(summary.textContent).toContain(adminReadOperationsCopy.en.betaRecordHelp);
    expect(rendered.container.querySelector('[data-slot="read-panel"]')).toBeNull();
    expect(summary.querySelector('[role="meter"]')).not.toBeNull();
    rendered.cleanup();
  });
  it('keeps the returned window beside each distribution, without a separate explanatory column', async () => {
    const rendered = view(<><AdminNotificationsPage /><AdminApplicationsPage /></>);
    await text(rendered.container, 'Total applications');
    for (const summary of Array.from(rendered.container.querySelectorAll('[data-slot="operations-summary"]'))) {
      expect(summary.querySelectorAll('[data-slot="count-distribution"]')).toHaveLength(1);
      expect(summary.querySelector('[data-slot="returned-period"]')?.textContent).toContain(period.from);
      expect(summary.querySelector('[data-slot="returned-period"]')?.textContent).toContain(period.to);
      expect(summary.querySelector('[data-slot="statistics-grid"]')).toBeNull();
    }
    expect(rendered.container.querySelectorAll('[data-slot="read-panel"]')).toHaveLength(1);
    expect(rendered.required('[data-slot="read-panel"]').textContent).toContain('Captured delivery failures');
    rendered.cleanup();
  });
  it('does not mount reads when the shell feature flag is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_CONSOLE_ENABLED', 'false');
    const rendered = view(<AdminConsoleShell><AdminNotificationsPage /></AdminConsoleShell>);
    expect(rendered.container.textContent).toContain('Admin Console unavailable'); expect(api.notifications).not.toHaveBeenCalled(); rendered.cleanup();
  });
});

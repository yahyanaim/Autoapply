import { describe, expect, it, vi } from 'vitest';
import { createDashboardSentryInitializer } from './sentry';

describe('dashboard Sentry initialization', () => {
  it('does not load the SDK when browser Sentry is disabled', async () => {
    const loadSentry = vi.fn();
    const initializer = createDashboardSentryInitializer(loadSentry as never);

    await initializer.initializeBrowserSentry({
      NEXT_PUBLIC_SENTRY_ENABLED: 'false',
    });

    expect(loadSentry).not.toHaveBeenCalled();
  });

  it('fails before loading the SDK when enabled server Sentry has no DSN', async () => {
    const loadSentry = vi.fn();
    const initializer = createDashboardSentryInitializer(loadSentry as never);

    await expect(
      initializer.initializeServerSentry('node', {
        DASHBOARD_SENTRY_ENABLED: 'true',
      }),
    ).rejects.toThrow(
      'DASHBOARD_SENTRY_DSN is required when DASHBOARD_SENTRY_ENABLED=true',
    );
    expect(loadSentry).not.toHaveBeenCalled();
  });

  it('uses the server-only flag for server initialization', async () => {
    const init = vi.fn();
    const loadSentry = vi.fn().mockResolvedValue({
      init,
      makeNodeTransport: vi.fn(),
      makeFetchTransport: vi.fn(),
    });
    const initializer = createDashboardSentryInitializer(loadSentry as never);

    await initializer.initializeServerSentry('node', {
      NEXT_PUBLIC_SENTRY_ENABLED: 'true',
      NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.com/123',
      DASHBOARD_SENTRY_ENABLED: 'false',
    });

    expect(loadSentry).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
  });
});

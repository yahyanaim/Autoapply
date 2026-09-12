import { describe, expect, it } from 'vitest';
import {
  parseDashboardBrowserSentryConfiguration,
  parseDashboardServerSentryConfiguration,
} from './sentry-config';

describe('dashboard Sentry configuration', () => {
  it('keeps browser Sentry disabled unless its public flag is exactly true', () => {
    expect(parseDashboardBrowserSentryConfiguration({})).toEqual({
      enabled: false,
    });
    expect(() =>
      parseDashboardBrowserSentryConfiguration({
        NEXT_PUBLIC_SENTRY_ENABLED: 'yes',
      }),
    ).toThrow('NEXT_PUBLIC_SENTRY_ENABLED must be exactly "true" or "false"');
  });

  it('validates browser configuration independently from server configuration', () => {
    expect(
      parseDashboardBrowserSentryConfiguration({
        NEXT_PUBLIC_SENTRY_ENABLED: 'true',
        NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.com/123',
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'preview',
        NEXT_PUBLIC_SENTRY_RELEASE: '2026.09.10',
        DASHBOARD_SENTRY_ENABLED: 'false',
      }),
    ).toEqual({
      enabled: true,
      dsn: 'https://public@example.com/123',
      environment: 'preview',
      release: '2026.09.10',
    });
    expect(
      parseDashboardServerSentryConfiguration({
        NEXT_PUBLIC_SENTRY_ENABLED: 'true',
        NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.com/123',
        SENTRY_ENABLED: 'false',
      }),
    ).toEqual({ enabled: false });
  });

  it('requires a valid server DSN when server Sentry is enabled', () => {
    expect(() =>
      parseDashboardServerSentryConfiguration({
        DASHBOARD_SENTRY_ENABLED: 'true',
      }),
    ).toThrow(
      'DASHBOARD_SENTRY_DSN is required when DASHBOARD_SENTRY_ENABLED=true',
    );
    expect(() =>
      parseDashboardServerSentryConfiguration({
        DASHBOARD_SENTRY_ENABLED: 'true',
        DASHBOARD_SENTRY_DSN: 'invalid',
      }),
    ).toThrow('DASHBOARD_SENTRY_DSN must be a valid Sentry DSN URL');
  });

  it('rejects non-deployment metadata before Sentry can initialize', () => {
    expect(() =>
      parseDashboardBrowserSentryConfiguration({
        NEXT_PUBLIC_SENTRY_ENABLED: 'true',
        NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.com/123',
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'candidate@example.com',
      }),
    ).toThrow('NEXT_PUBLIC_SENTRY_ENABLED environment must be an approved deployment name');
    expect(() =>
      parseDashboardServerSentryConfiguration({
        DASHBOARD_SENTRY_ENABLED: 'true',
        DASHBOARD_SENTRY_DSN: 'https://public@example.com/123',
        DASHBOARD_SENTRY_RELEASE: 'john_smith.resume/unsafe',
      }),
    ).toThrow('DASHBOARD_SENTRY_ENABLED release contains unsafe characters');
  });
});

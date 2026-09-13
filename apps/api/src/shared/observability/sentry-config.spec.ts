import { parseApiSentryConfiguration } from './sentry-config';

describe('parseApiSentryConfiguration', () => {
  it('keeps Sentry disabled unless the flag is exactly true', () => {
    expect(parseApiSentryConfiguration({})).toEqual({ enabled: false });
    expect(
      parseApiSentryConfiguration({ SENTRY_ENABLED: 'false' }),
    ).toEqual({ enabled: false });
    expect(() =>
      parseApiSentryConfiguration({ SENTRY_ENABLED: '1' }),
    ).toThrow('SENTRY_ENABLED must be exactly "true" or "false"');
  });

  it('requires a valid DSN before enabled Sentry can initialize', () => {
    expect(() =>
      parseApiSentryConfiguration({ SENTRY_ENABLED: 'true' }),
    ).toThrow('SENTRY_DSN is required when SENTRY_ENABLED=true');
    expect(() =>
      parseApiSentryConfiguration({
        SENTRY_ENABLED: 'true',
        SENTRY_DSN: 'not-a-dsn',
      }),
    ).toThrow('SENTRY_DSN must be a valid Sentry DSN URL');
  });

  it('returns the validated enabled configuration', () => {
    expect(
      parseApiSentryConfiguration({
        SENTRY_ENABLED: 'true',
        SENTRY_DSN: 'https://public@example.com/123',
        SENTRY_ENVIRONMENT: 'production',
        SENTRY_RELEASE: '2026.09.10',
      }),
    ).toEqual({
      enabled: true,
      dsn: 'https://public@example.com/123',
      environment: 'production',
      release: '2026.09.10',
    });
  });

  it('rejects untrusted release and environment values before SDK loading', () => {
    expect(() =>
      parseApiSentryConfiguration({
        SENTRY_ENABLED: 'true',
        SENTRY_DSN: 'https://public@example.com/123',
        SENTRY_ENVIRONMENT: 'candidate@example.com',
      }),
    ).toThrow('SENTRY_ENVIRONMENT must be an approved deployment name');
    expect(() =>
      parseApiSentryConfiguration({
        SENTRY_ENABLED: 'true',
        SENTRY_DSN: 'https://public@example.com/123',
        SENTRY_RELEASE: 'john_smith.resume/unsafe',
      }),
    ).toThrow('SENTRY_RELEASE contains unsafe characters');
  });
});

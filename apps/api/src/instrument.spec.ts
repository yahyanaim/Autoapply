import { createSentryInitializer } from './instrument';

describe('createSentryInitializer', () => {
  it('does not load the Sentry SDK when SENTRY_ENABLED is not exactly true', async () => {
    const loadSentry = jest.fn();
    const initialize = createSentryInitializer(loadSentry);

    await initialize({ SENTRY_ENABLED: 'false' });

    expect(loadSentry).not.toHaveBeenCalled();
  });

  it('fails before loading the SDK when enabled Sentry has no DSN', async () => {
    const loadSentry = jest.fn();
    const initialize = createSentryInitializer(loadSentry);

    await expect(initialize({ SENTRY_ENABLED: 'true' })).rejects.toThrow(
      'SENTRY_DSN is required when SENTRY_ENABLED=true',
    );
    expect(loadSentry).not.toHaveBeenCalled();
  });

  it('initializes the SDK only once after strict configuration validation', async () => {
    const init = jest.fn();
    const loadSentry = jest.fn().mockResolvedValue({
      init,
      makeNodeTransport: jest.fn(),
    });
    const initialize = createSentryInitializer(
      loadSentry as unknown as () => Promise<typeof import('@sentry/nestjs')>,
    );
    const environment = {
      SENTRY_ENABLED: 'true',
      SENTRY_DSN: 'https://public@example.com/123',
    };

    await initialize(environment);
    await initialize(environment);

    expect(loadSentry).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);
  });
});

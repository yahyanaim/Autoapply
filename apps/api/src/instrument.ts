import { createSentryEventSanitizer } from './shared/observability/sentry-sanitizer';
import { parseApiSentryConfiguration } from './shared/observability/sentry-config';
import { createPrivacySafeTransport } from './shared/observability/sentry-privacy-transport';

type Environment = Record<string, string | undefined>;
type SentryLoader = () => Promise<typeof import('@sentry/nestjs')>;

export function createSentryInitializer(
  loadSentry: SentryLoader = () => import('@sentry/nestjs'),
): (environment?: Environment) => Promise<void> {
  let sentryInitialized = false;

  return async (environment: Environment = process.env): Promise<void> => {
    const configuration = parseApiSentryConfiguration(environment);
    if (!configuration.enabled || !configuration.dsn || sentryInitialized) return;

    const Sentry = await loadSentry();
    const sanitizeEvent = createSentryEventSanitizer({
      platform: 'node',
      environment: configuration.environment,
      release: configuration.release,
    });
    Sentry.init({
      dsn: configuration.dsn,
      environment: configuration.environment,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      includeLocalVariables: false,
      enableLogs: false,
      enableMetrics: false,
      beforeBreadcrumb: () => null,
      beforeSendTransaction: () => null,
      beforeSend: sanitizeEvent,
      transport: (options) =>
        createPrivacySafeTransport(
          Sentry.makeNodeTransport(options),
          sanitizeEvent,
        ),
    });
    sentryInitialized = true;
  };
}

export const initializeSentryEarly = createSentryInitializer();

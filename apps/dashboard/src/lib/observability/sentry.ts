import { createSentryEventSanitizer } from './sentry-sanitizer';
import { createPrivacySafeTransport } from './sentry-privacy-transport';
import {
  type DashboardSentryConfiguration,
  parseDashboardBrowserSentryConfiguration,
  parseDashboardServerSentryConfiguration,
} from './sentry-config';

const BLOCKED_BROWSER_INTEGRATIONS = new Set([
  'BrowserSession',
  'Breadcrumbs',
  'HttpContext',
  'ConversationId',
]);

type Environment = Record<string, string | undefined>;
type SentryLoader = () => Promise<typeof import('@sentry/nextjs')>;

export function createDashboardSentryInitializer(
  loadSentry: SentryLoader = () => import('@sentry/nextjs'),
) {
  return {
    async initializeBrowserSentry(
      environment: Environment = process.env,
    ): Promise<void> {
      const configuration = parseDashboardBrowserSentryConfiguration(environment);
      await initializeSentry(configuration, 'browser', loadSentry);
    },
    async initializeServerSentry(
      runtime: 'node' | 'edge',
      environment: Environment = process.env,
    ): Promise<void> {
      const configuration = parseDashboardServerSentryConfiguration(environment);
      await initializeSentry(configuration, runtime, loadSentry);
    },
  };
}

const defaultInitializer = createDashboardSentryInitializer();

export function initializeBrowserSentry(): void {
  void defaultInitializer.initializeBrowserSentry();
}

export async function initializeServerSentry(
  runtime: 'node' | 'edge',
): Promise<void> {
  await defaultInitializer.initializeServerSentry(runtime);
}

export function captureBrowserException(error: Error): void {
  const configuration = parseDashboardBrowserSentryConfiguration();
  if (!configuration.enabled) return;

  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.captureException(error);
  });
}

async function initializeSentry(
  configuration: DashboardSentryConfiguration,
  runtime: 'browser' | 'node' | 'edge',
  loadSentry: SentryLoader,
): Promise<void> {
  if (!configuration.enabled || !configuration.dsn) return;

  const Sentry = await loadSentry();
  const sanitizeEvent = createSentryEventSanitizer({
    platform: runtime === 'browser' ? 'javascript' : 'node',
    environment: configuration.environment,
    release: configuration.release,
  });
  const sharedOptions = {
    dsn: configuration.dsn,
    environment: configuration.environment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableLogs: false,
    enableMetrics: false,
    sendClientReports: false,
    beforeBreadcrumb: () => null,
    beforeSendTransaction: () => null,
    beforeSend: sanitizeEvent,
  };

  if (runtime === 'node') {
    Sentry.init({
      ...sharedOptions,
      transport: (options: Parameters<typeof Sentry.makeNodeTransport>[0]) =>
        createPrivacySafeTransport(
          Sentry.makeNodeTransport(options),
          sanitizeEvent,
        ),
    });
    return;
  }

  Sentry.init({
    ...sharedOptions,
    ...(runtime === 'browser'
      ? {
          integrations: (defaults) =>
            defaults.filter(
              (integration) =>
                !BLOCKED_BROWSER_INTEGRATIONS.has(integration.name),
            ),
        }
      : {}),
    transport: (options: Parameters<typeof Sentry.makeFetchTransport>[0]) =>
      createPrivacySafeTransport(
        Sentry.makeFetchTransport(options),
        sanitizeEvent,
      ),
  });
}

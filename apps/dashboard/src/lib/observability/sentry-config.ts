export interface DashboardSentryConfiguration {
  enabled: boolean;
  dsn?: string;
  environment?: string;
  release?: string;
}

type Environment = Record<string, string | undefined>;

export function parseDashboardBrowserSentryConfiguration(
  environment: Environment = process.env,
): DashboardSentryConfiguration {
  return parseDashboardSentryConfiguration(
    environment.NEXT_PUBLIC_SENTRY_ENABLED,
    environment.NEXT_PUBLIC_SENTRY_DSN,
    environment.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    environment.NEXT_PUBLIC_SENTRY_RELEASE,
    'NEXT_PUBLIC_SENTRY_ENABLED',
    'NEXT_PUBLIC_SENTRY_DSN',
  );
}

export function parseDashboardServerSentryConfiguration(
  environment: Environment = process.env,
): DashboardSentryConfiguration {
  return parseDashboardSentryConfiguration(
    environment.DASHBOARD_SENTRY_ENABLED,
    environment.DASHBOARD_SENTRY_DSN,
    environment.DASHBOARD_SENTRY_ENVIRONMENT,
    environment.DASHBOARD_SENTRY_RELEASE,
    'DASHBOARD_SENTRY_ENABLED',
    'DASHBOARD_SENTRY_DSN',
  );
}

function parseDashboardSentryConfiguration(
  enabledValue: string | undefined,
  dsnValue: string | undefined,
  environmentValue: string | undefined,
  releaseValue: string | undefined,
  enabledKey: string,
  dsnKey: string,
): DashboardSentryConfiguration {
  if (enabledValue === undefined || enabledValue === '' || enabledValue === 'false') {
    return { enabled: false };
  }
  if (enabledValue !== 'true') {
    throw new Error(`${enabledKey} must be exactly "true" or "false"`);
  }

  const dsn = dsnValue?.trim();
  if (!dsn) throw new Error(`${dsnKey} is required when ${enabledKey}=true`);
  validateSentryDsn(dsn, dsnKey);
  const sentryEnvironment = environmentValue?.trim();
  const release = releaseValue?.trim();
  validateTrustedMetadata(sentryEnvironment, release, enabledKey);

  return {
    enabled: true,
    dsn,
    ...(sentryEnvironment ? { environment: sentryEnvironment } : {}),
    ...(release ? { release } : {}),
  };
}

function validateTrustedMetadata(
  environment: string | undefined,
  release: string | undefined,
  enabledKey: string,
): void {
  if (
    environment &&
    !['development', 'test', 'staging', 'production', 'preview'].includes(
      environment,
    )
  ) {
    throw new Error(`${enabledKey} environment must be an approved deployment name`);
  }
  if (release && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(release)) {
    throw new Error(`${enabledKey} release contains unsafe characters`);
  }
}

function validateSentryDsn(dsn: string, key: string): void {
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    throw new Error(`${key} must be a valid Sentry DSN URL`);
  }

  const projectId = parsed.pathname.split('/').filter(Boolean).at(-1);
  const validProtocol = parsed.protocol === 'https:' || parsed.protocol === 'http:';
  if (
    !validProtocol ||
    !parsed.hostname ||
    !parsed.username ||
    parsed.password ||
    !projectId ||
    !/^\d+$/.test(projectId)
  ) {
    throw new Error(`${key} must be a valid Sentry DSN URL`);
  }
}

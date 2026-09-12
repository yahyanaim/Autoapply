export interface ApiSentryConfiguration {
  enabled: boolean;
  dsn?: string;
  environment?: string;
  release?: string;
}

type Environment = Record<string, string | undefined>;

/**
 * This parser is intentionally independent of Nest. It runs before the Nest
 * configuration module, so Sentry cannot be enabled by JavaScript truthiness
 * or initialized with an invalid DSN during bootstrap.
 */
export function parseApiSentryConfiguration(
  environment: Environment = process.env,
): ApiSentryConfiguration {
  const enabled = parseStrictBoolean(
    environment.SENTRY_ENABLED,
    'SENTRY_ENABLED',
  );
  if (!enabled) return { enabled: false };

  const dsn = environment.SENTRY_DSN?.trim();
  if (!dsn) {
    throw new Error('SENTRY_DSN is required when SENTRY_ENABLED=true');
  }
  validateSentryDsn(dsn);

  const sentryEnvironment =
    environment.SENTRY_ENVIRONMENT?.trim() || environment.NODE_ENV?.trim();
  const release = environment.SENTRY_RELEASE?.trim();
  validateTrustedMetadata(sentryEnvironment, release);

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
): void {
  if (
    environment &&
    !['development', 'test', 'staging', 'production', 'preview'].includes(
      environment,
    )
  ) {
    throw new Error('SENTRY_ENVIRONMENT must be an approved deployment name');
  }
  if (release && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(release)) {
    throw new Error('SENTRY_RELEASE contains unsafe characters');
  }
}

export function parseStrictBoolean(
  value: string | undefined,
  key: string,
): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;

  throw new Error(`${key} must be exactly "true" or "false"`);
}

function validateSentryDsn(dsn: string): void {
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    throw new Error('SENTRY_DSN must be a valid Sentry DSN URL');
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
    throw new Error('SENTRY_DSN must be a valid Sentry DSN URL');
  }
}

export interface CorsConfigReader {
  get<T>(key: string, defaultValue?: T): T;
}

const CHROME_EXTENSION_ID = /^[a-p]{32}$/;

export function buildAllowedCorsOrigins(
  config: CorsConfigReader,
): ReadonlySet<string> {
  const configuredOrigins = [
    config.get<string>('DASHBOARD_URL', 'http://localhost:3000'),
    ...(config.get<string>('CORS_ALLOWED_ORIGINS', '') || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];
  const allowed = new Set<string>();

  for (const configuredOrigin of configuredOrigins) {
    const normalized = normalizeWebOrigin(configuredOrigin);
    if (!normalized) {
      throw new Error(
        'DASHBOARD_URL and CORS_ALLOWED_ORIGINS must contain credential-free HTTP(S) origins',
      );
    }
    allowed.add(normalized);
  }

  const extensionId = config.get<string>('EXTENSION_ID', '').trim();
  if (extensionId) {
    if (!CHROME_EXTENSION_ID.test(extensionId)) {
      throw new Error(
        'EXTENSION_ID must be a 32-character Chrome extension ID',
      );
    }
    allowed.add(`chrome-extension://${extensionId}`);
  }

  return allowed;
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  // Requests without Origin are non-browser clients such as workers and
  // health probes. Browser origins must match an approved origin exactly.
  return origin === undefined || allowedOrigins.has(origin);
}

function normalizeWebOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return '';
    }
    return url.origin;
  } catch {
    return '';
  }
}

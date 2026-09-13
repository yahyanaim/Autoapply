import type { ErrorEvent as SentryErrorEvent } from '@sentry/nestjs';

type UnknownRecord = Record<string, unknown>;

export const SENTRY_PRIVACY_LIMITS = Object.freeze({
  maxPayloadCharacters: 8_192,
  maxDepth: 8,
  maxArrayLength: 64,
  maxObjectKeys: 64,
  maxExceptionValues: 4,
  maxStackFrames: 32,
  maxStringLength: 256,
  maxTechnicalLocation: 10_000_000,
});

const TRUSTED_ENVIRONMENTS = new Set([
  'development',
  'test',
  'staging',
  'production',
  'preview',
]);
const TRUSTED_RELEASE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface SentrySanitizerConfiguration {
  platform: 'node' | 'javascript';
  environment?: string;
  release?: string;
}

/**
 * Produces a new, deliberately tiny event. Candidate data and arbitrary SDK
 * metadata are examined only to reject unsafe input; they are never copied.
 */
export function createSentryEventSanitizer(
  configuration: SentrySanitizerConfiguration,
): (event: SentryErrorEvent) => SentryErrorEvent | null {
  const trustedMetadata = readTrustedMetadata(configuration);

  return (event: SentryErrorEvent): SentryErrorEvent | null => {
    try {
      if (!isSafeInput(event)) return null;

      const source = asRecord(event);
      const exception = source && sanitizeException(source.exception);
      if (!exception) return null;

      const sanitized: UnknownRecord = {
        platform: configuration.platform,
        level: 'error',
        exception,
        ...trustedMetadata,
      };
      return isWithinPayloadLimit(sanitized)
        ? (sanitized as unknown as SentryErrorEvent)
        : null;
    } catch {
      return null;
    }
  };
}

export const sanitizeSentryEvent = createSentryEventSanitizer({
  platform: 'node',
});

function readTrustedMetadata(
  configuration: SentrySanitizerConfiguration,
): UnknownRecord {
  const metadata: UnknownRecord = {};
  if (configuration.environment) {
    if (!TRUSTED_ENVIRONMENTS.has(configuration.environment)) {
      throw new Error('Sentry environment must be an approved deployment name');
    }
    metadata.environment = configuration.environment;
  }
  if (configuration.release) {
    if (!TRUSTED_RELEASE.test(configuration.release)) {
      throw new Error('Sentry release contains unsafe characters');
    }
    metadata.release = configuration.release;
  }
  return metadata;
}

function sanitizeException(value: unknown): UnknownRecord | undefined {
  const exception = asRecord(value);
  if (!exception || !Array.isArray(exception.values)) return undefined;
  if (
    exception.values.length === 0 ||
    exception.values.length > SENTRY_PRIVACY_LIMITS.maxExceptionValues
  ) {
    return undefined;
  }

  const values: UnknownRecord[] = [];
  for (const valueItem of exception.values) {
    const source = asRecord(valueItem);
    if (!source) return undefined;

    const sanitized: UnknownRecord = { type: 'ApplyAIError' };
    const stacktrace = sanitizeStacktrace(source.stacktrace);
    if (source.stacktrace !== undefined && !stacktrace) return undefined;
    if (stacktrace) sanitized.stacktrace = stacktrace;
    values.push(sanitized);
  }

  return { values };
}

function sanitizeStacktrace(value: unknown): UnknownRecord | undefined {
  const stacktrace = asRecord(value);
  if (!stacktrace || !Array.isArray(stacktrace.frames)) return undefined;
  if (stacktrace.frames.length > SENTRY_PRIVACY_LIMITS.maxStackFrames) {
    return undefined;
  }

  const frames: UnknownRecord[] = [];
  for (const frameItem of stacktrace.frames) {
    const source = asRecord(frameItem);
    if (!source) return undefined;

    const frame: UnknownRecord = {};
    copyTechnicalLocation(source, frame, 'lineno');
    copyTechnicalLocation(source, frame, 'colno');
    if (typeof source.in_app === 'boolean') frame.in_app = source.in_app;
    frames.push(frame);
  }

  return { frames };
}

function copyTechnicalLocation(
  source: UnknownRecord,
  target: UnknownRecord,
  key: 'lineno' | 'colno',
): void {
  const value = source[key];
  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= SENTRY_PRIVACY_LIMITS.maxTechnicalLocation
  ) {
    target[key] = value;
  }
}

function isSafeInput(value: unknown): boolean {
  const state = { seen: new WeakSet<object>(), characters: 0, nodes: 0 };
  return inspectInput(value, state, 0);
}

function inspectInput(
  value: unknown,
  state: { seen: WeakSet<object>; characters: number; nodes: number },
  depth: number,
): boolean {
  try {
    if (depth > SENTRY_PRIVACY_LIMITS.maxDepth) return false;
    if (++state.nodes > SENTRY_PRIVACY_LIMITS.maxPayloadCharacters) return false;
    if (value === null || value === undefined || typeof value === 'boolean') {
      return true;
    }
    if (typeof value === 'string') {
      state.characters += value.length;
      return (
        value.length <= SENTRY_PRIVACY_LIMITS.maxStringLength &&
        state.characters <= SENTRY_PRIVACY_LIMITS.maxPayloadCharacters
      );
    }
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'object') return false;
    if (state.seen.has(value)) return false;
    state.seen.add(value);

    if (Array.isArray(value)) return inspectArray(value, state, depth);
    if (!isPlainRecord(value)) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.length > SENTRY_PRIVACY_LIMITS.maxObjectKeys) return false;

    for (const key of keys) {
      if (typeof key !== 'string' || key.length > SENTRY_PRIVACY_LIMITS.maxStringLength) {
        return false;
      }
      state.characters += key.length;
      if (state.characters > SENTRY_PRIVACY_LIMITS.maxPayloadCharacters) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return false;
      if (!inspectInput(descriptor.value, state, depth + 1)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function inspectArray(
  value: unknown[],
  state: { seen: WeakSet<object>; characters: number; nodes: number },
  depth: number,
): boolean {
  if (value.length > SENTRY_PRIVACY_LIMITS.maxArrayLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) return false;
    if (!inspectInput(descriptor.value, state, depth + 1)) return false;
  }
  return Reflect.ownKeys(value).every(
    (key) => key === 'length' || (/^(0|[1-9]\d*)$/.test(String(key)) && Number(key) < value.length),
  );
}

function isWithinPayloadLimit(value: UnknownRecord): boolean {
  try {
    return JSON.stringify(value).length <= SENTRY_PRIVACY_LIMITS.maxPayloadCharacters;
  } catch {
    return false;
  }
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && isPlainRecord(value)
    ? value
    : undefined;
}

function isPlainRecord(value: object): value is UnknownRecord {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

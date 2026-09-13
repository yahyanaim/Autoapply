import type { ErrorEvent as SentryErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import {
  createSentryEventSanitizer,
  SENTRY_PRIVACY_LIMITS,
} from './sentry-sanitizer';

const sensitiveValues = [
  'candidate@example.com',
  '+212600000000',
  '203.0.113.7',
  'Bearer ACCESS_TOKEN',
  'session_cookie_value',
  'FULL_CV_CONTENT',
  'PROMPT_TEXT',
  'GENERATED_DOCUMENT',
  'john_smith.resume',
  'Jane.Doe',
  'ahmed_elamrani.ts',
  'request-id-123',
];

function eventWithSensitiveData(): Record<string, unknown> {
  return {
    platform: 'javascript',
    message: 'FULL_CV_CONTENT',
    environment: 'candidate@example.com',
    release: 'john_smith.resume',
    transaction: '/users/42?token=ACCESS_TOKEN',
    request: {
      url: 'https://applyai.example/users/42?email=candidate@example.com',
      data: 'FULL_CV_CONTENT',
      headers: { authorization: 'Bearer ACCESS_TOKEN', cookie: 'session_cookie_value' },
    },
    user: { email: 'candidate@example.com', ip_address: '203.0.113.7', phone: '+212600000000' },
    extra: {
      prompt: 'PROMPT_TEXT',
      resume: 'FULL_CV_CONTENT',
      generatedDocument: 'GENERATED_DOCUMENT',
      identifier: 'Jane.Doe',
    },
    breadcrumbs: [{ message: 'PROMPT_TEXT' }],
    cause: { message: 'FULL_CV_CONTENT', cause: { message: 'PROMPT_TEXT' } },
    exception: {
      values: [{
        type: 'Jane.Doe',
        value: 'FULL_CV_CONTENT',
        module: 'ahmed_elamrani.ts',
        stacktrace: {
          frames: [{
            filename: '/Users/john_smith.resume/page.tsx?token=ACCESS_TOKEN',
            function: 'Jane.Doe',
            lineno: 8,
            colno: 4,
            in_app: true,
          }],
        },
      }],
    },
  };
}

describe('createSentryEventSanitizer', () => {
  const sanitize = createSentryEventSanitizer({
    platform: 'javascript',
    environment: 'preview',
    release: '2026.09.10',
  });

  it('creates a new minimal event and removes sensitive browser data', () => {
    const event = eventWithSensitiveData();
    const original = JSON.parse(JSON.stringify(event));

    const sanitized = sanitize(event as unknown as SentryErrorEvent);
    const serialized = JSON.stringify(sanitized);

    for (const value of sensitiveValues) expect(serialized).not.toContain(value);
    expect(sanitized).toEqual({
      platform: 'javascript',
      level: 'error',
      environment: 'preview',
      release: '2026.09.10',
      exception: {
        values: [{
          type: 'ApplyAIError',
          stacktrace: { frames: [{ lineno: 8, colno: 4, in_app: true }] },
        }],
      },
    });
    expect(event).toEqual(original);
    expect(sanitized).not.toBe(event);
  });

  it.each([
    ['a throwing getter', () => {
      const event = eventWithSensitiveData();
      Object.defineProperty(event, 'unsafe', {
        enumerable: true,
        get() { throw new Error('must not run'); },
      });
      return event;
    }],
    ['a throwing proxy', () => new Proxy(eventWithSensitiveData(), {
      ownKeys() { throw new Error('must not run'); },
    })],
    ['circular data', () => {
      const event = eventWithSensitiveData();
      (event.extra as Record<string, unknown>).self = event;
      return event;
    }],
    ['excessive nesting', () => {
      const event = eventWithSensitiveData();
      const deep: Record<string, unknown> = {};
      let current = deep;
      for (let index = 0; index <= SENTRY_PRIVACY_LIMITS.maxDepth; index += 1) {
        current.child = {};
        current = current.child as Record<string, unknown>;
      }
      event.extra = deep;
      return event;
    }],
    ['a huge array', () => ({
      ...eventWithSensitiveData(),
      breadcrumbs: Array.from({ length: SENTRY_PRIVACY_LIMITS.maxArrayLength + 1 }, () => 'safe'),
    })],
    ['too many exception values', () => ({
      ...eventWithSensitiveData(),
      exception: { values: Array.from({ length: SENTRY_PRIVACY_LIMITS.maxExceptionValues + 1 }, () => ({})) },
    })],
    ['too many stack frames', () => ({
      ...eventWithSensitiveData(),
      exception: { values: [{ stacktrace: { frames: Array.from({ length: SENTRY_PRIVACY_LIMITS.maxStackFrames + 1 }, () => ({})) } }] },
    })],
    ['an oversized string', () => ({
      ...eventWithSensitiveData(),
      message: 'x'.repeat(SENTRY_PRIVACY_LIMITS.maxStringLength + 1),
    })],
    ['an oversized source event', () => ({
      ...eventWithSensitiveData(),
      extra: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`safe${index}`, 'x'.repeat(SENTRY_PRIVACY_LIMITS.maxStringLength)])),
    })],
    ['an Error cause chain', () => ({
      ...eventWithSensitiveData(),
      cause: new Error('FULL_CV_CONTENT', { cause: new Error('PROMPT_TEXT') }),
    })],
  ])('fails closed for %s', (_name, createUnsafeEvent) => {
    expect(
      sanitize(createUnsafeEvent() as unknown as SentryErrorEvent),
    ).toBeNull();
  });

  it('rejects malformed events and invalid trusted configuration', () => {
    expect(
      sanitize({ message: 'candidate@example.com' } as unknown as SentryErrorEvent),
    ).toBeNull();
    expect(() =>
      createSentryEventSanitizer({
        platform: 'javascript',
        release: 'john_smith.resume/unsafe',
      }),
    ).toThrow('Sentry release contains unsafe characters');
  });
});

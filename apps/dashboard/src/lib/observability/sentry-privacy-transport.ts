type UnknownRecord = Record<string, unknown>;

interface SentryTransport<TEnvelope = unknown, TResult = unknown> {
  send(envelope: TEnvelope): PromiseLike<TResult>;
  flush(timeout?: number): PromiseLike<boolean>;
}

/**
 * Sentry's SDK hooks only apply to error events. This transport is a final
 * privacy boundary: it discards every envelope item except a sanitized error
 * event, including sessions, traces, replays, logs, metrics, and attachments.
 */
export function createPrivacySafeTransport<
  TEnvelope,
  TResult,
  TTransport extends SentryTransport<TEnvelope, TResult>,
  TEvent,
>(transport: TTransport, sanitizeEvent: (event: TEvent) => unknown | null): TTransport {
  return {
    ...transport,
    send(envelope: TEnvelope): PromiseLike<TResult> {
      const filtered = filterSentryEnvelope(envelope, sanitizeEvent);
      if (!filtered) return Promise.resolve({ status: 'success' } as TResult);

      return transport.send(filtered as TEnvelope);
    },
  } as TTransport;
}

export function filterSentryEnvelope<TEvent>(
  envelope: unknown,
  sanitizeEvent: (event: TEvent) => unknown | null,
): unknown[] | undefined {
  try {
    if (!Array.isArray(envelope) || !Array.isArray(envelope[1])) return undefined;

    const items = envelope[1]
      .map((item) => sanitizeEnvelopeItem(item, sanitizeEvent))
      .filter((item): item is unknown[] => item !== undefined);

    return items.length > 0 ? [{}, items] : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeEnvelopeItem<TEvent>(
  item: unknown,
  sanitizeEvent: (event: TEvent) => unknown | null,
): unknown[] | undefined {
  if (!Array.isArray(item) || item.length < 2) return undefined;

  const header = asRecord(item[0]);
  if (!header || header.type !== 'event') return undefined;

  const event = sanitizeEvent(item[1] as TEvent);
  return event ? [{ type: 'event' }, event] : undefined;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object'
    ? (value as UnknownRecord)
    : undefined;
}

export interface MutationIdempotencyStore {
  keyFor(payload: unknown): string;
  clear(payload: unknown): void;
}

/**
 * Keeps one idempotency key for each pending semantic mutation. A network
 * error must not generate a new key: the server may already have completed
 * the first request. Call `clear` only after a successful response.
 */
export function createMutationIdempotencyStore(
  operation: string,
  createId: () => string = () => globalThis.crypto.randomUUID(),
): MutationIdempotencyStore {
  const pendingKeys = new Map<string, string>();

  return {
    keyFor(payload) {
      const fingerprint = stableJson(payload);
      const existing = pendingKeys.get(fingerprint);
      if (existing) return existing;
      const key = `${operation}:${createId()}`;
      pendingKeys.set(fingerprint, key);
      return key;
    },
    clear(payload) {
      pendingKeys.delete(stableJson(payload));
    },
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

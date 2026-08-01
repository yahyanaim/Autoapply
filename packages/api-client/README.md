# ApplyAI API client

The REST API requires `Idempotency-Key` on cost- and quota-consuming mutations.
The SDK option is optional only because the client creates a key when one is
omitted. Callers that retry after a timeout or lost response must reuse the same
key with the same payload. A new key represents a new operation. Reusing a key
with a different endpoint or payload, or while the first request remains
pending, returns `409 Conflict`.

```ts
const idempotencyKey = `discover:${crypto.randomUUID()}`;

try {
  await client.jobs.discover({ resumeId, idempotencyKey });
} catch (error) {
  // A retry must use idempotencyKey again because the first request may have
  // completed even when its response did not reach this client.
  await client.jobs.discover({ resumeId, idempotencyKey });
}
```

The dashboard keeps these keys stable for failed create, prepare, discovery,
optimization, and regeneration mutations, and clears them only after success.

import { describe, expect, it, vi } from 'vitest';
import { createMutationIdempotencyStore } from './mutation-idempotency';

describe('createMutationIdempotencyStore', () => {
  it('reuses a key after an error and clears it only after success', () => {
    const ids = ['first-id-00000001', 'second-id-0000002'];
    const createId = vi.fn(() => ids.shift()!);
    const store = createMutationIdempotencyStore('discover', createId);
    const payload = { resumeId: 'resume-1', limit: 20 };

    const firstAttempt = store.keyFor(payload);
    const retryAfterLostResponse = store.keyFor({
      limit: 20,
      resumeId: 'resume-1',
    });

    expect(retryAfterLostResponse).toBe(firstAttempt);
    expect(createId).toHaveBeenCalledTimes(1);

    store.clear(payload);
    expect(store.keyFor(payload)).not.toBe(firstAttempt);
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it('keeps different semantic payloads independent', () => {
    let sequence = 0;
    const store = createMutationIdempotencyStore('optimize', () =>
      `generated-id-${++sequence}`.padEnd(16, '0'),
    );

    expect(store.keyFor({ resumeId: 'resume-1', jobId: 'job-1' })).not.toBe(
      store.keyFor({ resumeId: 'resume-1', jobId: 'job-2' }),
    );
  });
});

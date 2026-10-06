import type { AIResponse } from '../domain/ai-provider.interface';

/** Application-owned boundary invoked once for each dispatched provider call. */
export interface AiProviderAttemptRunner {
  run(providerName: string, invoke: () => Promise<AIResponse>): Promise<AIResponse>;
}

/** Do not retry another provider when durable capture itself fails. */
export class AiAttemptRecordingError extends Error {
  constructor() { super('AI cost capture is unavailable'); }
}

export class AiAttemptNotDispatchedError extends Error {
  constructor(readonly reason: 'circuit_open' | 'probe_busy' | 'unsupported_provider' | 'configuration_unavailable') {
    super('AI provider was not dispatched');
  }
}

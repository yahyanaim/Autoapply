export interface PromptTemplate {
  id: string;
  version: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface AIResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
}

/**
 * Per-attempt limits chosen by the trusted server-side execution boundary.
 * They are intentionally not derived from an HTTP request or browser state.
 */
export interface AIExecutionOptions {
  timeoutMs?: number;
  maxOutputTokens?: number;
}

export interface AIProvider {
  complete(
    prompt: PromptTemplate,
    context: Record<string, unknown>,
    options?: AIExecutionOptions,
  ): Promise<AIResponse>;
}

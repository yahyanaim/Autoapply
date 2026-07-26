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

export interface AIProvider {
  complete(
    prompt: PromptTemplate,
    context: Record<string, unknown>,
  ): Promise<AIResponse>;
}

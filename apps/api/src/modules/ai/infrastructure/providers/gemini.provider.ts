import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AIProvider,
  AIExecutionOptions,
  AIResponse,
  PromptTemplate,
} from '../../domain/ai-provider.interface';
import { AiAttemptNotDispatchedError } from '../../application/ai-provider-attempt';

@Injectable()
export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI | null = null;
  private model: string;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>(
      'GOOGLE_AI_MODEL',
      'gemini-1.5-flash',
    );
  }

  assertReadyForDispatch(): void {
    const apiKey = this.configService.get<string>('GOOGLE_AI_API_KEY');
    if (typeof apiKey !== 'string' || !apiKey.trim() ||
      typeof this.model !== 'string' || !this.model.trim()) {
      throw new AiAttemptNotDispatchedError('configuration_unavailable');
    }
    try {
      this.genAI ??= new GoogleGenerativeAI(apiKey);
    } catch {
      throw new AiAttemptNotDispatchedError('configuration_unavailable');
    }
  }

  async complete(
    prompt: PromptTemplate,
    context: Record<string, unknown>,
    options?: AIExecutionOptions,
  ): Promise<AIResponse> {
    const apiKey = this.configService.get<string>('GOOGLE_AI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('Google AI is not configured');
    this.genAI ??= new GoogleGenerativeAI(apiKey);
    const userContent = this.interpolate(prompt.userPrompt, context);

    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: prompt.systemPrompt,
      generationConfig: {
        maxOutputTokens:
          options?.maxOutputTokens ??
          this.configService.get<number>('AI_MAX_OUTPUT_TOKENS', 2_048),
      },
    });

    const result = await model.generateContent(userContent, {
      timeout:
        options?.timeoutMs ??
        this.configService.get<number>('AI_REQUEST_TIMEOUT_MS', 30_000),
    });
    const response = result.response;

    const inputTokenCount = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokenCount = response.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      content: response.text(),
      tokensUsed: {
        input: inputTokenCount,
        output: outputTokenCount,
      },
      usageReported: Number.isSafeInteger(response.usageMetadata?.promptTokenCount) &&
        Number.isSafeInteger(response.usageMetadata?.candidatesTokenCount) &&
        (response.usageMetadata?.promptTokenCount ?? -1) >= 0 &&
        (response.usageMetadata?.candidatesTokenCount ?? -1) >= 0,
      model: this.model,
    };
  }

  private interpolate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      return context[key] !== undefined ? String(context[key]) : `{{${key}}}`;
    });
  }
}

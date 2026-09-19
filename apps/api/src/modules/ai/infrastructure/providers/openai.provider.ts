import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AIProvider,
  AIExecutionOptions,
  AIResponse,
  PromptTemplate,
} from '../../domain/ai-provider.interface';

@Injectable()
export class OpenAIProvider implements AIProvider {
  private client: OpenAI | null = null;
  private model: string;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
  }

  async complete(
    prompt: PromptTemplate,
    context: Record<string, unknown>,
    options?: AIExecutionOptions,
  ): Promise<AIResponse> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('OpenAI is not configured');
    this.client ??= new OpenAI({
      apiKey,
      maxRetries: 0,
    });
    const userContent = this.interpolate(prompt.userPrompt, context);

    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        max_tokens:
          options?.maxOutputTokens ??
          this.configService.get<number>('AI_MAX_OUTPUT_TOKENS', 2_048),
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: userContent },
        ],
      },
      {
        timeout:
          options?.timeoutMs ??
          this.configService.get<number>('AI_REQUEST_TIMEOUT_MS', 30_000),
      },
    );

    const choice = response.choices[0];
    const usage = response.usage;

    return {
      content: choice.message.content || '',
      tokensUsed: {
        input: usage?.prompt_tokens ?? 0,
        output: usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }

  private interpolate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      return context[key] !== undefined ? String(context[key]) : `{{${key}}}`;
    });
  }
}

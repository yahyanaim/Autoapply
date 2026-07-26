import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  AIProvider,
  AIResponse,
  PromptTemplate,
} from '../../domain/ai-provider.interface';

@Injectable()
export class ClaudeProvider implements AIProvider {
  private client: Anthropic | null = null;
  private model: string;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>(
      'ANTHROPIC_MODEL',
      'claude-sonnet-4-20250514',
    );
  }

  async complete(
    prompt: PromptTemplate,
    context: Record<string, unknown>,
  ): Promise<AIResponse> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('Anthropic is not configured');
    this.client ??= new Anthropic({
      apiKey,
      timeout: this.configService.get<number>('AI_REQUEST_TIMEOUT_MS', 30_000),
      maxRetries: 0,
    });
    const userContent = this.interpolate(prompt.userPrompt, context);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.configService.get<number>('AI_MAX_OUTPUT_TOKENS', 2_048),
      system: prompt.systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const textBlock = response.content.find(block => block.type === 'text');

    return {
      content: textBlock?.text ?? '',
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
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

import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  AIResponse,
  PromptTemplate,
} from '../../domain/ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { ClaudeProvider } from './claude.provider';
import { GeminiProvider } from './gemini.provider';
import { RequestContextService } from '../../../../shared/observability/request-context.service';
import { SystemClock } from '../../../../shared/adapters/system-clock.adapter';

@Injectable()
export class AIProviderFactory {
  private readonly logger = new Logger(AIProviderFactory.name);
  private providers: Map<string, AIProvider> = new Map();
  private readonly circuitStates = new Map<
    string,
    { failures: number; openUntil: number; probeInFlight: boolean }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly openaiProvider: OpenAIProvider,
    private readonly claudeProvider: ClaudeProvider,
    private readonly geminiProvider: GeminiProvider,
    private readonly requestContext: RequestContextService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {
    this.providers.set('openai', this.openaiProvider);
    this.providers.set('claude', this.claudeProvider);
    this.providers.set('gemini', this.geminiProvider);
  }

  create(providerName?: string): AIProvider {
    const name = providerName ?? this.getProviderName();
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ServiceUnavailableException(
        `Unknown AI provider: ${name}. Available: ${[...this.providers.keys()].join(', ')}`,
      );
    }
    return provider;
  }

  async completeWithFallback(
    prompt: PromptTemplate,
    context: Record<string, unknown>,
  ): Promise<{ response: AIResponse; providerName: string }> {
    const attempted: string[] = [];
    for (const providerName of this.getProviderOrder()) {
      attempted.push(providerName);
      try {
        const response = await this.executeWithCircuitBreaker(
          providerName,
          prompt,
          context,
        );
        return { response, providerName };
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'ai_provider_failed',
            requestId: this.requestContext.getRequestId(),
            userId: this.requestContext.getUserId(),
            provider: providerName,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
    throw new ServiceUnavailableException(
      `AI providers are temporarily unavailable (${attempted.join(', ')})`,
    );
  }

  getProviderName(): string {
    return this.configService.get<string>('AI_PROVIDER', 'openai');
  }

  private getProviderOrder(): string[] {
    const primary = this.getProviderName().trim().toLowerCase();
    const fallbacks = this.configService
      .get<string>('AI_FALLBACK_PROVIDERS', 'claude,gemini')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set([primary, ...fallbacks])];
  }

  private async executeWithCircuitBreaker(
    providerName: string,
    prompt: PromptTemplate,
    context: Record<string, unknown>,
  ): Promise<AIResponse> {
    const state = this.circuitStates.get(providerName) ?? {
      failures: 0,
      openUntil: 0,
      probeInFlight: false,
    };
    this.circuitStates.set(providerName, state);

    const now = this.clock.nowMs();
    if (state.openUntil > now) {
      throw new Error('Circuit is open');
    }
    const probing = state.failures >= this.getFailureThreshold();
    if (probing && state.probeInFlight) {
      throw new Error('Circuit recovery probe is already running');
    }
    if (probing) state.probeInFlight = true;

    try {
      const response = await this.create(providerName).complete(prompt, context);
      state.failures = 0;
      state.openUntil = 0;
      return response;
    } catch (error) {
      state.failures += 1;
      if (state.failures >= this.getFailureThreshold()) {
        state.openUntil = now + this.getResetTimeoutMs();
      }
      throw error;
    } finally {
      if (probing) state.probeInFlight = false;
    }
  }

  private getFailureThreshold(): number {
    return Math.max(
      1,
      Number(this.configService.get('AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD', 3)),
    );
  }

  private getResetTimeoutMs(): number {
    return Math.max(
      1_000,
      Number(this.configService.get('AI_CIRCUIT_BREAKER_RESET_MS', 30_000)),
    );
  }

  getInputCostPerMillion(): number {
    return Number(this.configService.get('AI_INPUT_COST_PER_MILLION', 0));
  }

  getOutputCostPerMillion(): number {
    return Number(this.configService.get('AI_OUTPUT_COST_PER_MILLION', 0));
  }

  getMaxInputBytes(): number {
    return Number(this.configService.get('AI_MAX_INPUT_BYTES', 100_000));
  }

  getMaxOutputTokens(): number {
    return Number(this.configService.get('AI_MAX_OUTPUT_TOKENS', 2_048));
  }

  getMaxRequestCost(): number {
    return Number(this.configService.get('AI_MAX_REQUEST_COST_USD', 0.5));
  }
}

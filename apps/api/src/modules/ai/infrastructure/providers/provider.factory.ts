import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIExecutionOptions,
  AIProvider,
  AIResponse,
  PromptTemplate,
} from '../../domain/ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { ClaudeProvider } from './claude.provider';
import { GeminiProvider } from './gemini.provider';
import { RequestContextService } from '../../../../shared/observability/request-context.service';
import { SystemClock } from '../../../../shared/adapters/system-clock.adapter';
import { serializeSafeLog } from '../../../../shared/observability/safe-log';

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
    const deadline = this.clock.nowMs() + this.getFallbackTimeoutMs();
    const inputBytes = this.renderedInputBytes(prompt, context);
    let estimatedCost = 0;

    for (const providerName of this.getProviderOrder().slice(
      0,
      this.getMaxProviderAttempts(),
    )) {
      const remainingMs = deadline - this.clock.nowMs();
      if (remainingMs <= 0) break;

      const maxOutputTokens = this.getMaxOutputTokensForProvider(providerName);
      const options: AIExecutionOptions = {
        timeoutMs: remainingMs,
        maxOutputTokens,
      };
      const nextEstimatedCost = this.estimateProviderCost(
        providerName,
        inputBytes,
        maxOutputTokens,
      );
      if (estimatedCost + nextEstimatedCost > this.getMaxFallbackCost()) {
        break;
      }
      estimatedCost += nextEstimatedCost;
      attempted.push(providerName);
      try {
        const response = await this.executeWithCircuitBreaker(
          providerName,
          prompt,
          context,
          options,
        );
        return { response, providerName };
      } catch (error) {
        this.logger.warn(
          serializeSafeLog({
            event: 'ai_provider_failed',
            component: 'ai',
            requestId: this.requestContext.getRequestId(),
            provider: providerName,
            error,
          }),
        );
      }
    }
    throw new ServiceUnavailableException(
      attempted.length > 0
        ? 'AI providers are temporarily unavailable'
        : 'AI provider execution budget is unavailable',
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
    options: AIExecutionOptions,
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
      const response = await this.create(providerName).complete(
        prompt,
        context,
        options,
      );
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

  getInputCostPerMillion(providerName?: string): number {
    return this.getInputCostPerMillionForProvider(providerName);
  }

  getOutputCostPerMillion(providerName?: string): number {
    return this.getOutputCostPerMillionForProvider(providerName);
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

  getMaxOutputTokensForProvider(providerName: string): number {
    return (
      this.getProviderNumber(providerName, 'MAX_OUTPUT_TOKENS') ??
      this.getMaxOutputTokens()
    );
  }

  getMaxProviderAttempts(): number {
    return Math.max(
      1,
      Math.min(
        3,
        Number(this.configService.get('AI_MAX_PROVIDER_ATTEMPTS', 3)),
      ),
    );
  }

  getFallbackTimeoutMs(): number {
    return Math.max(
      1_000,
      Number(
        this.configService.get(
          'AI_FALLBACK_TOTAL_TIMEOUT_MS',
          this.configService.get('AI_REQUEST_TIMEOUT_MS', 30_000),
        ),
      ),
    );
  }

  getMaxFallbackCost(): number {
    const configuredFallbackCap = Number(
      this.configService.get(
        'AI_MAX_FALLBACK_TOTAL_COST_USD',
        this.getMaxRequestCost(),
      ),
    );
    // The fallback budget is an additional constraint, never a way to raise
    // the absolute spend allowed for one paid request.
    return Math.min(configuredFallbackCap, this.getMaxRequestCost());
  }

  getInputCostPerMillionForProvider(providerName?: string): number {
    return this.getProviderCost(
      providerName,
      'INPUT_COST_PER_MILLION',
      'AI_INPUT_COST_PER_MILLION',
    );
  }

  getOutputCostPerMillionForProvider(providerName?: string): number {
    return this.getProviderCost(
      providerName,
      'OUTPUT_COST_PER_MILLION',
      'AI_OUTPUT_COST_PER_MILLION',
    );
  }

  private getProviderCost(
    providerName: string | undefined,
    suffix: string,
    fallbackKey: string,
  ): number {
    const configured = providerName
      ? this.getProviderNumber(providerName, suffix)
      : undefined;
    return Number(
      configured ?? this.configService.get(fallbackKey, 0),
    );
  }

  private getProviderNumber(
    providerName: string,
    suffix: string,
  ): number | undefined {
    for (const prefix of this.getProviderConfigPrefixes(providerName)) {
      const configured = this.configService.get<unknown>(`${prefix}_${suffix}`);
      if (typeof configured === 'number' && Number.isFinite(configured)) {
        return configured;
      }
    }
    return undefined;
  }

  private getProviderConfigPrefixes(providerName: string): string[] {
    switch (providerName.trim().toLowerCase()) {
      case 'claude':
        // ANTHROPIC_* is the documented configuration. CLAUDE_* remains a
        // fallback for deployments that adopted the provider's runtime name.
        return ['ANTHROPIC', 'CLAUDE'];
      case 'openai':
        return ['OPENAI'];
      case 'gemini':
        return ['GEMINI'];
      default:
        return [providerName.trim().toUpperCase()];
    }
  }

  private estimateProviderCost(
    providerName: string,
    inputBytes: number,
    maxOutputTokens: number,
  ): number {
    // Bytes deliberately over-estimate input tokens across tokenizers.
    return (
      (inputBytes * this.getInputCostPerMillionForProvider(providerName) +
        maxOutputTokens * this.getOutputCostPerMillionForProvider(providerName)) /
      1_000_000
    );
  }

  private renderedInputBytes(
    prompt: PromptTemplate,
    context: Record<string, unknown>,
  ): number {
    const userPrompt = prompt.userPrompt.replace(
      /\{\{\s*(\w+)\s*\}\}/g,
      (_, key) =>
        context[key] !== undefined ? String(context[key]) : `{{${key}}}`,
    );
    return Buffer.byteLength(prompt.systemPrompt) + Buffer.byteLength(userPrompt);
  }

}

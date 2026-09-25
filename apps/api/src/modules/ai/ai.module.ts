import { Module } from '@nestjs/common';
import { AIService } from './application/ai.service';
import { PromptService } from './application/prompt.service';
import { AIProviderFactory } from './infrastructure/providers/provider.factory';
import { OpenAIProvider } from './infrastructure/providers/openai.provider';
import { ClaudeProvider } from './infrastructure/providers/claude.provider';
import { GeminiProvider } from './infrastructure/providers/gemini.provider';
import { GlmProvider } from './infrastructure/providers/glm.provider';
import { PlanAwareAiRouter } from './application/plan-aware-ai.router';
import { AIController } from './interface/ai.controller';
import { BillingModule } from '../billing/billing.module';
import { MatchScoreCacheService } from './application/match-score-cache.service';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AiMetricsReadService } from './application/ai-metrics-read.service';

@Module({
  imports: [BillingModule, IdempotencyModule],
  providers: [
    AIService,
    PromptService,
    AIProviderFactory,
    OpenAIProvider,
    ClaudeProvider,
    GeminiProvider,
    GlmProvider,
    PlanAwareAiRouter,
    MatchScoreCacheService,
    AiMetricsReadService,
  ],
  controllers: [AIController],
  exports: [
    AIService,
    PromptService,
    PlanAwareAiRouter,
    MatchScoreCacheService,
    AiMetricsReadService,
  ],
})
export class AIModule {}

import { Module } from '@nestjs/common';
import { AIService } from './application/ai.service';
import { PromptService } from './application/prompt.service';
import { AIProviderFactory } from './infrastructure/providers/provider.factory';
import { OpenAIProvider } from './infrastructure/providers/openai.provider';
import { ClaudeProvider } from './infrastructure/providers/claude.provider';
import { GeminiProvider } from './infrastructure/providers/gemini.provider';
import { AIController } from './interface/ai.controller';
import { BillingModule } from '../billing/billing.module';
import { MatchScoreCacheService } from './application/match-score-cache.service';

@Module({
  imports: [BillingModule],
  providers: [
    AIService,
    PromptService,
    AIProviderFactory,
    OpenAIProvider,
    ClaudeProvider,
    GeminiProvider,
    MatchScoreCacheService,
  ],
  controllers: [AIController],
  exports: [AIService, PromptService, MatchScoreCacheService],
})
export class AIModule {}

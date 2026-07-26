import { Module } from '@nestjs/common';
import { AIService } from './application/ai.service';
import { PromptService } from './application/prompt.service';
import { AIProviderFactory } from './infrastructure/providers/provider.factory';
import { OpenAIProvider } from './infrastructure/providers/openai.provider';
import { ClaudeProvider } from './infrastructure/providers/claude.provider';
import { GeminiProvider } from './infrastructure/providers/gemini.provider';
import { AIController } from './interface/ai.controller';

@Module({
  providers: [
    AIService,
    PromptService,
    AIProviderFactory,
    OpenAIProvider,
    ClaudeProvider,
    GeminiProvider,
  ],
  controllers: [AIController],
  exports: [AIService, PromptService],
})
export class AIModule {}

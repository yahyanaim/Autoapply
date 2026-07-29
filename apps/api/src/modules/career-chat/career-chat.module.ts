import { Module } from '@nestjs/common';
import { CareerChatService } from './application/career-chat.service';
import { CareerChatContextService } from './application/career-chat-context.service';
import { CAREER_CHAT_CONTEXT } from './domain/career-chat-context.interface';
import { CAREER_CHAT_PROVIDER } from './domain/career-chat-provider.interface';
import { DahlCareerChatProvider } from './infrastructure/dahl-career-chat.provider';
import { CareerChatController } from './interface/career-chat.controller';

@Module({
  controllers: [CareerChatController],
  providers: [
    CareerChatService,
    CareerChatContextService,
    {
      provide: CAREER_CHAT_CONTEXT,
      useExisting: CareerChatContextService,
    },
    DahlCareerChatProvider,
    {
      provide: CAREER_CHAT_PROVIDER,
      useExisting: DahlCareerChatProvider,
    },
  ],
})
export class CareerChatModule {}

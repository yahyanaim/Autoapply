import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { standaloneCareerChatValidationSchema } from './standalone-career-chat.config';
import { CareerChatService } from '../modules/career-chat/application/career-chat.service';
import { CAREER_CHAT_CONTEXT } from '../modules/career-chat/domain/career-chat-context.interface';
import { CAREER_CHAT_PROVIDER } from '../modules/career-chat/domain/career-chat-provider.interface';
import { CareerChatHealthService } from '../modules/career-chat/infrastructure/career-chat-health.service';
import { CareerChatUsageLimiter } from '../modules/career-chat/infrastructure/career-chat-usage-limiter.service';
import { DahlCareerChatProvider } from '../modules/career-chat/infrastructure/dahl-career-chat.provider';
import { CareerChatController } from '../modules/career-chat/interface/career-chat.controller';
import { StandaloneHealthController } from './standalone-health.controller';
import { createStandaloneThrottleOptions } from './standalone-throttle.options';
import { StaticCareerChatContextService } from './static-career-chat-context.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validationSchema: standaloneCareerChatValidationSchema,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createStandaloneThrottleOptions,
    }),
  ],
  controllers: [CareerChatController, StandaloneHealthController],
  providers: [
    CareerChatService,
    CareerChatHealthService,
    CareerChatUsageLimiter,
    DahlCareerChatProvider,
    {
      provide: CAREER_CHAT_PROVIDER,
      useExisting: DahlCareerChatProvider,
    },
    {
      provide: CAREER_CHAT_CONTEXT,
      useClass: StaticCareerChatContextService,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [CareerChatHealthService],
})
export class CareerChatStandaloneModule {}

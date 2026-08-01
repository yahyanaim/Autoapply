import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Joi from 'joi';
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
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        PORT: Joi.number().port().default(3001),
        CAREER_CHAT_STANDALONE: Joi.boolean().valid(true).required(),
        CAREER_CHAT_ENABLED: Joi.boolean().valid(true).required(),
        DAHL_CAREER_CHAT_API_KEY: Joi.string().min(1).required(),
        DAHL_CAREER_CHAT_BASE_URL: Joi.string()
          .uri({ scheme: ['https'] })
          .default('https://inference.dahl.global/v1'),
        DAHL_CAREER_CHAT_MODEL: Joi.string()
          .max(200)
          .default('MiniMaxAI/MiniMax-M2.7'),
        DAHL_CAREER_CHAT_TIMEOUT_MS: Joi.number()
          .integer()
          .min(1_000)
          .max(120_000)
          .default(30_000),
        DAHL_CAREER_CHAT_MAX_OUTPUT_TOKENS: Joi.number()
          .integer()
          .min(128)
          .max(2_048)
          .default(700),
        DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS: Joi.number()
          .integer()
          .min(512)
          .max(16_384)
          .default(3_500),
        DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET: Joi.number()
          .integer()
          .min(3_500)
          .max(1_000_000_000)
          .default(250_000),
        DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET: Joi.number()
          .integer()
          .min(3_500)
          .max(10_000_000_000)
          .default(5_000_000),
        DAHL_CAREER_CHAT_MAX_RETRIES: Joi.number()
          .integer()
          .min(0)
          .max(3)
          .default(2),
        DAHL_CAREER_CHAT_RETRY_BASE_DELAY_MS: Joi.number()
          .integer()
          .min(0)
          .max(5_000)
          .default(200),
        DAHL_CAREER_CHAT_CIRCUIT_BREAKER_FAILURE_THRESHOLD: Joi.number()
          .integer()
          .min(1)
          .max(20)
          .default(3),
        DAHL_CAREER_CHAT_CIRCUIT_BREAKER_RESET_MS: Joi.number()
          .integer()
          .min(1_000)
          .max(600_000)
          .default(30_000),
        DAHL_CAREER_CHAT_HEALTH_TIMEOUT_MS: Joi.number()
          .integer()
          .min(500)
          .max(30_000)
          .default(3_000),
        REDIS_URL: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string()
            .uri({ scheme: ['redis', 'rediss'] })
            .required(),
          otherwise: Joi.string()
            .uri({ scheme: ['redis', 'rediss'] })
            .allow('')
            .optional(),
        }),
        DASHBOARD_URL: Joi.string()
          .uri({ scheme: ['https', 'http'] })
          .default('http://localhost:3000'),
        CORS_ALLOWED_ORIGINS: Joi.string().allow('').default(''),
        TRUST_PROXY_HOPS: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.number().integer().min(0).max(5).required(),
          otherwise: Joi.number().integer().min(0).max(5).default(0),
        }),
      }).unknown(true),
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

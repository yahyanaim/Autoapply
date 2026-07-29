import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Joi from 'joi';
import { CareerChatService } from '../modules/career-chat/application/career-chat.service';
import { CAREER_CHAT_CONTEXT } from '../modules/career-chat/domain/career-chat-context.interface';
import { CAREER_CHAT_PROVIDER } from '../modules/career-chat/domain/career-chat-provider.interface';
import { DahlCareerChatProvider } from '../modules/career-chat/infrastructure/dahl-career-chat.provider';
import { CareerChatController } from '../modules/career-chat/interface/career-chat.controller';
import { StandaloneHealthController } from './standalone-health.controller';
import { StaticCareerChatContextService } from './static-career-chat-context.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().port().default(3001),
        CAREER_CHAT_STANDALONE: Joi.boolean().valid(true).required(),
        CAREER_CHAT_ENABLED: Joi.boolean().valid(true).required(),
        DAHL_CAREER_CHAT_API_KEY: Joi.string().min(1).required(),
        DAHL_CAREER_CHAT_BASE_URL: Joi.string()
          .uri({ scheme: ['https'] })
          .default('https://inference.dahl.global/v1'),
        DAHL_CAREER_CHAT_MODEL: Joi.string().max(200).default('MiniMaxAI/MiniMax-M2.7'),
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
        DASHBOARD_URL: Joi.string().uri({ scheme: ['https', 'http'] }).default(
          'http://localhost:3000',
        ),
        CORS_ALLOWED_ORIGINS: Joi.string().allow('').default(''),
        TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(0),
      }).unknown(true),
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60 * 60_000,
        limit: 20,
      },
    ]),
  ],
  controllers: [CareerChatController, StandaloneHealthController],
  providers: [
    CareerChatService,
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
})
export class CareerChatStandaloneModule {}

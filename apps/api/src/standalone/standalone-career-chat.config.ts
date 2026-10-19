import Joi from 'joi';
import { CareerChatMessage } from '../modules/career-chat/domain/career-chat-provider.interface';
import { prepareCareerChatMessages } from '../modules/career-chat/application/career-chat.service';
import { DahlCareerChatProvider } from '../modules/career-chat/infrastructure/dahl-career-chat.provider';
import { estimateCareerChatRequestUnits } from '../modules/career-chat/infrastructure/career-chat-usage-limiter.service';
import {
  CAREER_CHAT_DEFAULT_OUTPUT_TOKENS,
  CAREER_CHAT_DEFAULT_REQUEST_UNITS,
  CAREER_CHAT_MESSAGE_CHARACTERS,
} from '../modules/career-chat/domain/career-chat-limits';
import { standaloneCareerChatContextText } from './static-career-chat-context.service';

/** Full ordinary-Unicode question plus 256 bytes for greeting/framing headroom.
 * JSON-escape-heavy input can still exceed the independent runtime byte ceiling.
 */
export function minimumStandaloneRequestUnits(outputTokens: number): number {
  return (
    standaloneRequestUnits(
      [{ role: 'user', content: '界'.repeat(CAREER_CHAT_MESSAGE_CHARACTERS) }],
      outputTokens,
    ) + 256
  );
}

/** Minimum supported API starter: one "Hi" question, without prior history. */
export function minimumStandaloneStarterReservation(
  outputTokens: number,
  retries: number,
): number {
  return (
    standaloneRequestUnits([{ role: 'user', content: 'Hi' }], outputTokens) *
    (retries + 1)
  );
}

function standaloneRequestUnits(
  messages: CareerChatMessage[],
  outputTokens: number,
): number {
  return estimateCareerChatRequestUnits(
    DahlCareerChatProvider.toDahlCompatibleMessages(
      prepareCareerChatMessages(messages, standaloneCareerChatContextText()),
    ),
    outputTokens,
  );
}

export const standaloneCareerChatValidationSchema = Joi.object({
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
    .default(CAREER_CHAT_DEFAULT_OUTPUT_TOKENS),
  DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS: Joi.number()
    .integer()
    .min(512)
    .max(16_384)
    .default(CAREER_CHAT_DEFAULT_REQUEST_UNITS),
  DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET: Joi.number()
    .integer()
    .min(1)
    .max(1_000_000_000)
    .default(250_000),
  DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET: Joi.number()
    .integer()
    .min(1)
    .max(10_000_000_000)
    .default(5_000_000),
  DAHL_CAREER_CHAT_MAX_RETRIES: Joi.number().integer().min(0).max(3).default(2),
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
})
  .unknown(true)
  .custom((config, helpers) => {
    const minimum = minimumStandaloneRequestUnits(
      config.DAHL_CAREER_CHAT_MAX_OUTPUT_TOKENS,
    );
    if (config.DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS < minimum) {
      return helpers.message({
        custom: `CAREER_CHAT_REQUEST_BUDGET_INVALID: DAHL_CAREER_CHAT_MAX_REQUEST_TOKENS must be at least ${minimum} for the framed prompt, a full ordinary-Unicode question and output allowance`,
      });
    }
    const starterReservation = minimumStandaloneStarterReservation(
      config.DAHL_CAREER_CHAT_MAX_OUTPUT_TOKENS,
      config.DAHL_CAREER_CHAT_MAX_RETRIES,
    );
    for (const setting of [
      'DAHL_CAREER_CHAT_DAILY_TOKEN_BUDGET',
      'DAHL_CAREER_CHAT_MONTHLY_TOKEN_BUDGET',
    ]) {
      if (config[setting] < starterReservation) {
        return helpers.message({
          custom: `CAREER_CHAT_REQUEST_BUDGET_INVALID: ${setting} must be at least ${starterReservation} to fund a starter request with all configured attempts; review this budget or reduce the configured output allowance/retries`,
        });
      }
    }
    return config;
  }, 'usable Nori request allowance');

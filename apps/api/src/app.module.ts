import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './database/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ResumeModule } from './modules/resume/resume.module';
import { JobModule } from './modules/job/job.module';
import { ApplicationModule } from './modules/application-tracker/application-tracker.module';
import { AIModule } from './modules/ai/ai.module';
import { BillingModule } from './modules/billing/billing.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthController } from './health.controller';
import { RedisThrottlerStorage } from './shared/throttling/redis-throttler.storage';
import { ObservabilityModule } from './shared/observability/observability.module';
import { UserAwareThrottlerGuard } from './shared/throttling/user-aware-throttler.guard';
import { redisUrlSchema } from './shared/config/production-environment.schema';
import { planAwareExecutionConfigurationError } from './shared/config/plan-aware-execution-config';
import { parseApiSentryConfiguration } from './shared/observability/sentry-config';

function sentryModuleImports(): DynamicModule[] {
  if (!parseApiSentryConfiguration().enabled) return [];

  const { SentryModule } = require('@sentry/nestjs/setup') as typeof import('@sentry/nestjs/setup');
  return [SentryModule.forRoot()];
}

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
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().default('15m'),
        REFRESH_TOKEN_TTL_DAYS: Joi.number()
          .integer()
          .min(1)
          .max(90)
          .default(7),
        SESSION_IDLE_TIMEOUT_MINUTES: Joi.number()
          .integer()
          .min(5)
          .max(1440)
          .default(15),
        SESSION_ABSOLUTE_TIMEOUT_HOURS: Joi.number()
          .integer()
          .min(1)
          .max(168)
          .default(8),
        MFA_ENCRYPTION_KEY: Joi.string()
          .allow('')
          .custom((value: string, helpers) =>
            !value || Buffer.from(value, 'base64').length === 32
              ? value
              : helpers.message({
                  custom:
                    'MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
                }),
          )
          .default(''),
        RESUME_QUEUE_SIGNING_KEY: Joi.string()
          .allow('')
          .custom((value: string, helpers) =>
            !value || Buffer.from(value, 'base64').length === 32
              ? value
              : helpers.message({
                  custom:
                    'RESUME_QUEUE_SIGNING_KEY must be a base64-encoded 32-byte key',
                }),
          )
          .default(''),
        DASHBOARD_URL: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string().uri().required(),
          otherwise: Joi.string().uri().default('http://localhost:3000'),
        }),
        CORS_ALLOWED_ORIGINS: Joi.string().allow('').default(''),
        TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(0),
        EXTENSION_ID: Joi.string().allow('').optional(),
        APP_PROCESS_ROLE: Joi.string()
          .valid('all', 'api', 'worker')
          .default('all'),
        RESUME_PARSE_LEGACY_DRAIN_ENABLED: Joi.boolean().default(false),
        REDIS_URL: redisUrlSchema(),
        SENTRY_ENABLED: Joi.string().valid('true', 'false').default('false'),
        SENTRY_DSN: Joi.string().allow('').default(''),
        SENTRY_ENVIRONMENT: Joi.string().max(64).allow('').default(''),
        SENTRY_RELEASE: Joi.string().max(64).allow('').default(''),
        BETA_MODE: Joi.boolean().default(false),
        ADMIN_CONSOLE_ENABLED: Joi.boolean().default(false),
        BETA_MAX_REGISTRATIONS: Joi.number()
          .integer()
          .min(1)
          .max(100_000)
          .default(100),
        STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
        AWS_REGION: Joi.string().max(64).default('us-east-1'),
        S3_BUCKET_RESUMES: Joi.string().when('STORAGE_DRIVER', {
          is: 's3',
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        S3_ENDPOINT: Joi.string().allow('').default(''),
        S3_REGION: Joi.string().max(64).allow('').default(''),
        S3_ACCESS_KEY_ID: Joi.string().allow('').default(''),
        S3_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
        S3_FORCE_PATH_STYLE: Joi.string()
          .valid('true', 'false')
          .default('false'),
        AI_EXECUTION_ROLE: Joi.string()
          .valid('all', 'free', 'paid')
          .default('all'),
        FREE_AI_PROVIDER: Joi.string().valid('glm').default('glm'),
        GLM_FREE_PLAN_API_KEY: Joi.string().allow('').default(''),
        GLM_FREE_PLAN_MODEL: Joi.string()
          .pattern(/^[A-Za-z0-9._:-]{1,128}$/)
          .allow('')
          .default(''),
        GLM_FREE_PLAN_BASE_URL: Joi.string().allow('').default(''),
        GLM_FREE_PLAN_TIMEOUT_MS: Joi.number()
          .integer()
          .min(1_000)
          .max(120_000)
          .default(30_000),
        GLM_FREE_PLAN_MAX_OUTPUT_TOKENS: Joi.number()
          .integer()
          .min(128)
          .max(4_096)
          .default(2_048),
        GLM_FREE_PLAN_MAX_INPUT_BYTES: Joi.number()
          .integer()
          .min(1_000)
          .max(500_000)
          .default(100_000),
        AI_PROVIDER: Joi.string()
          .valid('openai', 'claude', 'gemini')
          .default('openai'),
        AI_INPUT_COST_PER_MILLION: Joi.number().min(0).default(0),
        AI_OUTPUT_COST_PER_MILLION: Joi.number().min(0).default(0),
        AI_MAX_INPUT_BYTES: Joi.number()
          .integer()
          .min(1_000)
          .max(500_000)
          .default(100_000),
        AI_MAX_OUTPUT_TOKENS: Joi.number()
          .integer()
          .min(128)
          .max(4_096)
          .default(2_048),
        AI_REQUEST_TIMEOUT_MS: Joi.number()
          .integer()
          .min(1_000)
          .max(120_000)
          .default(30_000),
        AI_MAX_REQUEST_COST_USD: Joi.number().positive().max(100).default(0.5),
        AI_MAX_FALLBACK_TOTAL_COST_USD: Joi.number()
          .positive()
          .max(100)
          .default(0.5),
        AI_MAX_PROVIDER_ATTEMPTS: Joi.number()
          .integer()
          .min(1)
          .max(3)
          .default(3),
        AI_FALLBACK_TOTAL_TIMEOUT_MS: Joi.number()
          .integer()
          .min(1_000)
          .max(120_000)
          .default(30_000),
        AI_FALLBACK_PROVIDERS: Joi.string().allow('').default('claude,gemini'),
        OPENAI_MAX_OUTPUT_TOKENS: Joi.number()
          .integer()
          .min(128)
          .max(4_096)
          .empty('')
          .optional(),
        ANTHROPIC_MAX_OUTPUT_TOKENS: Joi.number()
          .integer()
          .min(128)
          .max(4_096)
          .empty('')
          .optional(),
        GEMINI_MAX_OUTPUT_TOKENS: Joi.number()
          .integer()
          .min(128)
          .max(4_096)
          .empty('')
          .optional(),
        OPENAI_INPUT_COST_PER_MILLION: Joi.number().min(0).empty('').optional(),
        OPENAI_OUTPUT_COST_PER_MILLION: Joi.number().min(0).empty('').optional(),
        ANTHROPIC_INPUT_COST_PER_MILLION: Joi.number().min(0).empty('').optional(),
        ANTHROPIC_OUTPUT_COST_PER_MILLION: Joi.number().min(0).empty('').optional(),
        GEMINI_INPUT_COST_PER_MILLION: Joi.number().min(0).empty('').optional(),
        GEMINI_OUTPUT_COST_PER_MILLION: Joi.number().min(0).empty('').optional(),
        AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD: Joi.number()
          .integer()
          .min(1)
          .max(20)
          .default(3),
        AI_CIRCUIT_BREAKER_RESET_MS: Joi.number()
          .integer()
          .min(1_000)
          .max(600_000)
          .default(30_000),
        PARTNER_API_TIMEOUT_MS: Joi.number()
          .integer()
          .min(1_000)
          .max(120_000)
          .default(15_000),
        PARTNER_API_CIRCUIT_BREAKER_FAILURE_THRESHOLD: Joi.number()
          .integer()
          .min(1)
          .max(20)
          .default(3),
        PARTNER_API_CIRCUIT_BREAKER_RESET_MS: Joi.number()
          .integer()
          .min(1_000)
          .max(600_000)
          .default(30_000),
        JOB_DISCOVERY_SOURCES: Joi.string().allow('').default(''),
        JOB_DISCOVERY_REFRESH_TTL_MINUTES: Joi.number()
          .integer()
          .min(5)
          .max(1440)
          .default(30),
        JOB_DISCOVERY_MAX_JOB_AGE_HOURS: Joi.number()
          .integer()
          .min(1)
          .max(720)
          .default(168),
        OPENAI_API_KEY: Joi.string().allow('').default(''),
        ANTHROPIC_API_KEY: Joi.string().allow('').default(''),
        GOOGLE_AI_API_KEY: Joi.string().allow('').default(''),
        STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
        STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
        STRIPE_PRO_PRICE_ID: Joi.string().allow('').default(''),
        STRIPE_PREMIUM_PRICE_ID: Joi.string().allow('').default(''),
        STRIPE_SUCCESS_URL: Joi.string()
          .uri()
          .default('http://localhost:3000/billing?checkout=success'),
        STRIPE_CANCEL_URL: Joi.string()
          .uri()
          .default('http://localhost:3000/billing?checkout=cancelled'),
        SMTP_HOST: Joi.string().hostname().allow('').default(''),
        SMTP_PORT: Joi.number().port().default(587),
        SMTP_SECURE: Joi.boolean().default(false),
        SMTP_USER: Joi.string().allow('').default(''),
        SMTP_PASSWORD: Joi.string().allow('').default(''),
        SMTP_FROM: Joi.string().email().allow('').default(''),
        GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
        GOOGLE_CLIENT_SECRET: Joi.string().allow('').default(''),
        GOOGLE_CALLBACK_URL: Joi.string().uri().allow('').default(''),
        GITHUB_CLIENT_ID: Joi.string().allow('').default(''),
        GITHUB_CLIENT_SECRET: Joi.string().allow('').default(''),
        GITHUB_CALLBACK_URL: Joi.string().uri().allow('').default(''),
      })
        .unknown(true)
        .custom((environment, helpers) => {
          const configured = environment as Record<string, unknown>;
          const usesHttps = (value: unknown): boolean => {
            try {
              return new URL(String(value)).protocol === 'https:';
            } catch {
              return false;
            }
          };
          const requireTogether = (keys: string[], label: string) => {
            const present = keys.filter((key) => Boolean(configured[key]));
            if (present.length > 0 && present.length !== keys.length) {
              return helpers.message({
                custom: `${label} configuration is incomplete`,
              });
            }
            return undefined;
          };
          const oauthError =
            requireTogether(
              [
                'GOOGLE_CLIENT_ID',
                'GOOGLE_CLIENT_SECRET',
                'GOOGLE_CALLBACK_URL',
              ],
              'Google OAuth',
            ) ??
            requireTogether(
              [
                'GITHUB_CLIENT_ID',
                'GITHUB_CLIENT_SECRET',
                'GITHUB_CALLBACK_URL',
              ],
              'GitHub OAuth',
            );
          if (oauthError) return oauthError;

          const legacyResumeParseDrainEnabled =
            configured.RESUME_PARSE_LEGACY_DRAIN_ENABLED === true;
          if (
            legacyResumeParseDrainEnabled &&
            configured.APP_PROCESS_ROLE !== 'worker'
          ) {
            return helpers.message({
              custom:
                'RESUME_PARSE_LEGACY_DRAIN_ENABLED requires APP_PROCESS_ROLE=worker',
            });
          }

          const executionConfigurationError =
            planAwareExecutionConfigurationError(configured);
          if (executionConfigurationError) {
            return helpers.message({ custom: executionConfigurationError });
          }
          const canExecutePaid =
            !legacyResumeParseDrainEnabled &&
            configured.AI_EXECUTION_ROLE !== 'free';

          try {
            parseApiSentryConfiguration({
              SENTRY_ENABLED: configured.SENTRY_ENABLED as string | undefined,
              SENTRY_DSN: configured.SENTRY_DSN as string | undefined,
              SENTRY_ENVIRONMENT: configured.SENTRY_ENVIRONMENT as
                | string
                | undefined,
              SENTRY_RELEASE: configured.SENTRY_RELEASE as string | undefined,
              NODE_ENV: configured.NODE_ENV as string | undefined,
            });
          } catch (error) {
            return helpers.message({
              custom:
                error instanceof Error
                  ? error.message
                  : 'Sentry configuration is invalid',
            });
          }

          if (configured.NODE_ENV === 'production') {
            if (configured.STORAGE_DRIVER !== 's3') {
              return helpers.message({
                custom: 'STORAGE_DRIVER must be s3 in production',
              });
            }
            if (canExecutePaid) {
              const providerKey = {
                openai: 'OPENAI_API_KEY',
                claude: 'ANTHROPIC_API_KEY',
                gemini: 'GOOGLE_AI_API_KEY',
              }[String(configured.AI_PROVIDER)];
              if (!providerKey || !configured[providerKey]) {
                return helpers.message({
                  custom: 'The configured paid AI provider is required in production',
                });
              }
              for (const key of [
                'AI_INPUT_COST_PER_MILLION',
                'AI_OUTPUT_COST_PER_MILLION',
              ]) {
                if (!(Number(configured[key]) > 0)) {
                  return helpers.message({
                    custom: `${key} must be greater than zero in production`,
                  });
                }
              }
            }
            if (configured.APP_PROCESS_ROLE !== 'worker') {
              for (const key of [
                'STRIPE_SECRET_KEY',
                'STRIPE_WEBHOOK_SECRET',
                'STRIPE_PRO_PRICE_ID',
                'STRIPE_PREMIUM_PRICE_ID',
              ]) {
                if (!configured[key]) {
                  return helpers.message({
                    custom: `${key} is required in production`,
                  });
                }
              }
            }
            if (!configured.MFA_ENCRYPTION_KEY) {
              return helpers.message({
                custom: 'MFA_ENCRYPTION_KEY is required in production',
              });
            }
            if (
              !legacyResumeParseDrainEnabled &&
              !configured.RESUME_QUEUE_SIGNING_KEY
            ) {
              return helpers.message({
                custom:
                  'RESUME_QUEUE_SIGNING_KEY is required in production',
              });
            }
            for (const key of [
              'DASHBOARD_URL',
              'STRIPE_SUCCESS_URL',
              'STRIPE_CANCEL_URL',
              'GOOGLE_CALLBACK_URL',
              'GITHUB_CALLBACK_URL',
            ]) {
              if (configured[key] && !usesHttps(configured[key])) {
                return helpers.message({
                  custom: `${key} must use HTTPS in production`,
                });
              }
            }
            const corsOrigins = String(configured.CORS_ALLOWED_ORIGINS ?? '')
              .split(',')
              .map((origin) => origin.trim())
              .filter(Boolean);
            if (corsOrigins.some((origin) => !usesHttps(origin))) {
              return helpers.message({
                custom:
                  'CORS_ALLOWED_ORIGINS must contain only HTTPS origins in production',
              });
            }
          }
          return environment;
        }, 'cross-field environment validation'),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        storage: new RedisThrottlerStorage(
          configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
        ),
        throttlers: [
          {
            ttl: 15 * 60_000,
            limit: 1_000,
          },
        ],
      }),
    }),
    PrismaModule,
    ...sentryModuleImports(),
    ObservabilityModule,
    AuthModule,
    UserModule,
    ProfileModule,
    ResumeModule,
    JobModule,
    ApplicationModule,
    AIModule,
    BillingModule,
    NotificationModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: UserAwareThrottlerGuard,
    },
  ],
  controllers: [HealthController],
})
export class AppModule {}

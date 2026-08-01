import { Logger, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  ResumeService,
  StorageToken,
  ResumeParseQueueToken,
  ResumeParseDeadLetterQueueToken,
} from './application/resume.service';
import { S3StorageAdapter } from './infrastructure/storage/s3-storage.adapter';
import { LocalStorageAdapter } from '../../shared/adapters/local-storage.adapter';
import { ResumeParser } from './infrastructure/parsers/resume-parser';
import { AIModule } from '../ai/ai.module';
import { ResumeController } from './interface/resume.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ResumeParseWorker } from './infrastructure/queue/resume-parse.worker';
import { BillingModule } from '../billing/billing.module';
import { GeneratedResumePdfService } from './infrastructure/pdf/generated-resume-pdf.service';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';

function redisConnection(configService: ConfigService) {
  const url = new URL(
    configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
  );
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

@Module({
  imports: [AIModule, PrismaModule, BillingModule, IdempotencyModule],
  providers: [
    ResumeService,
    ResumeParser,
    S3StorageAdapter,
    LocalStorageAdapter,
    ResumeParseWorker,
    GeneratedResumePdfService,
    {
      provide: StorageToken,
      useFactory: (
        configService: ConfigService,
        localStorage: LocalStorageAdapter,
        s3Storage: S3StorageAdapter,
      ) =>
        configService.get('STORAGE_DRIVER', 'local') === 's3'
          ? s3Storage
          : localStorage,
      inject: [ConfigService, LocalStorageAdapter, S3StorageAdapter],
    },
    {
      provide: ResumeParseQueueToken,
      useFactory: (configService: ConfigService) => {
        const queue = new Queue('resume-parse', {
          connection: redisConnection(configService),
        });
        const logger = new Logger('ResumeParseQueue');
        queue.on('error', (error) => {
          logger.error(`Resume parse queue error: ${error.message}`);
        });
        return queue;
      },
      inject: [ConfigService],
    },
    {
      provide: ResumeParseDeadLetterQueueToken,
      useFactory: (configService: ConfigService) =>
        new Queue('resume-parse-dead-letter', {
          connection: redisConnection(configService),
        }),
      inject: [ConfigService],
    },
  ],
  controllers: [ResumeController],
  exports: [ResumeService, ResumeParseQueueToken, StorageToken],
})
export class ResumeModule {}

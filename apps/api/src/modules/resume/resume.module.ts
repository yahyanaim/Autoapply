import { Logger, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  ResumeService,
  StorageToken,
  ResumeParseFreeQueueToken,
  ResumeParsePaidQueueToken,
  ResumeParseDeadLetterQueueToken,
  resumeParseQueueName,
} from './application/resume.service';
import { S3StorageAdapter } from './infrastructure/storage/s3-storage.adapter';
import { LocalStorageAdapter } from '../../shared/adapters/local-storage.adapter';
import { ResumeParser } from './infrastructure/parsers/resume-parser';
import { AIModule } from '../ai/ai.module';
import { ResumeController } from './interface/resume.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ResumeParseWorker } from './infrastructure/queue/resume-parse.worker';
import { ResumeParseJobSignatureService } from './infrastructure/queue/resume-parse-job-signature.service';
import { BillingModule } from '../billing/billing.module';
import { GeneratedResumePdfService } from './infrastructure/pdf/generated-resume-pdf.service';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { serializeSafeLog } from '../../shared/observability/safe-log';
import { ResumeOperationsReadService } from './application/resume-operations-read.service';
import { ResumeRequeueCommandService } from './application/resume-requeue-command.service';
import { ResumeParseDispatcher } from './infrastructure/queue/resume-parse-dispatcher.service';

class InactiveResumeQueue {
  constructor(private readonly boundary: 'free' | 'paid') {}

  get client(): Promise<never> {
    return Promise.reject(
      new Error(`The ${this.boundary} resume queue is disabled in this role`),
    );
  }

  async add(): Promise<never> {
    throw new Error(`The ${this.boundary} resume queue is disabled in this role`);
  }

  async close(): Promise<void> {
    // No network connection was opened for an inactive queue.
  }
}

function canAccessResumeQueue(
  configService: ConfigService,
  boundary: 'free' | 'paid',
): boolean {
  const role = configService.get<string>('AI_EXECUTION_ROLE', 'all');
  return role === 'all' || role === boundary;
}

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

function createResumeQueue(
  configService: ConfigService,
  boundary: 'free' | 'paid',
): Queue {
  if (!canAccessResumeQueue(configService, boundary)) {
    // Restricted worker roles do not even initialize a client for the other
    // queue. Redis ACLs/network policy must still enforce the same boundary.
    return new InactiveResumeQueue(boundary) as unknown as Queue;
  }
  const queue = new Queue(resumeParseQueueName(boundary), {
    connection: redisConnection(configService),
  });
  const logger = new Logger(
    boundary === 'free' ? 'ResumeParseFreeQueue' : 'ResumeParsePaidQueue',
  );
  queue.on('error', (error) => {
    logger.error(
      serializeSafeLog({
        event: 'resume_parse_queue_failed',
        component: 'resume_queue',
        action: 'resume_parse',
        error,
      }),
    );
  });
  return queue;
}

@Module({
  imports: [AIModule, PrismaModule, BillingModule, IdempotencyModule],
  providers: [
    ResumeService,
    ResumeParser,
    S3StorageAdapter,
    LocalStorageAdapter,
    ResumeParseWorker,
    ResumeParseJobSignatureService,
    GeneratedResumePdfService,
    ResumeOperationsReadService,
    ResumeRequeueCommandService,
    ResumeParseDispatcher,
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
      provide: ResumeParseFreeQueueToken,
      useFactory: (configService: ConfigService) =>
        createResumeQueue(configService, 'free'),
      inject: [ConfigService],
    },
    {
      provide: ResumeParsePaidQueueToken,
      useFactory: (configService: ConfigService) =>
        createResumeQueue(configService, 'paid'),
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
  exports: [
    ResumeService,
    ResumeParseFreeQueueToken,
    ResumeParsePaidQueueToken,
    StorageToken,
    ResumeOperationsReadService,
    ResumeRequeueCommandService,
  ],
})
export class ResumeModule {}

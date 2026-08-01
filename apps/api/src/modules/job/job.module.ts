import { Module } from '@nestjs/common';
import { JobService } from './application/job.service';
import { JobController } from './interface/job.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { JobIngestionService } from './application/job-ingestion.service';
import { GreenhouseAdapter } from './infrastructure/sources/greenhouse/greenhouse.adapter';
import { LeverAdapter } from './infrastructure/sources/lever/lever.adapter';
import { AshbyAdapter } from './infrastructure/sources/ashby/ashby.adapter';
import { PartnerApiClient } from './infrastructure/sources/partner-api.client';
import { JobDiscoveryService } from './application/job-discovery.service';
import { AIModule } from '../ai/ai.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';

@Module({
  imports: [PrismaModule, AIModule, IdempotencyModule],
  providers: [
    JobService,
    JobIngestionService,
    JobDiscoveryService,
    PartnerApiClient,
    GreenhouseAdapter,
    LeverAdapter,
    AshbyAdapter,
  ],
  controllers: [JobController],
  exports: [JobService, JobIngestionService, JobDiscoveryService],
})
export class JobModule {}

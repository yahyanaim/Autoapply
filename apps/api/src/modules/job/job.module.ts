import { Module } from '@nestjs/common';
import { JobService } from './application/job.service';
import { JobController } from './interface/job.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { JobIngestionService } from './application/job-ingestion.service';
import { GreenhouseAdapter } from './infrastructure/sources/greenhouse/greenhouse.adapter';
import { LeverAdapter } from './infrastructure/sources/lever/lever.adapter';
import { AshbyAdapter } from './infrastructure/sources/ashby/ashby.adapter';
import { PartnerApiClient } from './infrastructure/sources/partner-api.client';

@Module({
  imports: [PrismaModule],
  providers: [
    JobService,
    JobIngestionService,
    PartnerApiClient,
    GreenhouseAdapter,
    LeverAdapter,
    AshbyAdapter,
  ],
  controllers: [JobController],
  exports: [JobService, JobIngestionService],
})
export class JobModule {}

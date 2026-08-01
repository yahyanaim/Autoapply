import { Module } from '@nestjs/common';
import { ApplicationTrackerService } from './application/application-tracker.service';
import { ApplicationTrackerController } from './interface/application-tracker.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AIModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';

@Module({
  imports: [PrismaModule, AIModule, BillingModule, IdempotencyModule],
  providers: [ApplicationTrackerService],
  controllers: [ApplicationTrackerController],
  exports: [ApplicationTrackerService],
})
export class ApplicationModule {}

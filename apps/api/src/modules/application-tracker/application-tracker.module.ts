import { Module } from '@nestjs/common';
import { ApplicationTrackerService } from './application/application-tracker.service';
import { ApplicationTrackerController } from './interface/application-tracker.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AIModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, AIModule, BillingModule],
  providers: [ApplicationTrackerService],
  controllers: [ApplicationTrackerController],
  exports: [ApplicationTrackerService],
})
export class ApplicationModule {}

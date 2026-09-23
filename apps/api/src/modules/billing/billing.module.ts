import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingService } from './application/billing.service';
import { BillingController } from './interface/billing.controller';
import { StripeAdapter } from './infrastructure/stripe/stripe.adapter';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { PlanEntitlementGuard } from './interface/guards/plan-entitlement.guard';
import { BillingUsageReadService } from './application/billing-usage-read.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    BillingService,
    BillingUsageReadService,
    StripeAdapter,
    PlanEntitlementGuard,
  ],
  controllers: [BillingController],
  exports: [
    BillingService,
    BillingUsageReadService,
    StripeAdapter,
    PlanEntitlementGuard,
  ],
})
export class BillingModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingService } from './application/billing.service';
import { BillingController } from './interface/billing.controller';
import { StripeAdapter } from './infrastructure/stripe/stripe.adapter';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { PlanEntitlementGuard } from './interface/guards/plan-entitlement.guard';
import { BillingUsageReadService } from './application/billing-usage-read.service';
import { BillingMetricsReadService } from './application/billing-metrics-read.service';
import { SubscriptionLifecycleService } from './application/subscription-lifecycle.service';
import { BillingFinancialMetricsRecorderService } from './application/billing-financial-metrics-recorder.service';
import { BillingFinancialMetricsReadService } from './application/billing-financial-metrics-read.service';
import { BillingQuotaService } from './application/billing-quota.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    BillingService,
    BillingUsageReadService,
    BillingMetricsReadService,
    SubscriptionLifecycleService,
    BillingFinancialMetricsRecorderService,
    BillingFinancialMetricsReadService,
    BillingQuotaService,
    StripeAdapter,
    PlanEntitlementGuard,
  ],
  controllers: [BillingController],
  exports: [
    BillingService,
    BillingUsageReadService,
    BillingMetricsReadService,
    BillingFinancialMetricsReadService,
    BillingQuotaService,
    StripeAdapter,
    PlanEntitlementGuard,
  ],
})
export class BillingModule {}

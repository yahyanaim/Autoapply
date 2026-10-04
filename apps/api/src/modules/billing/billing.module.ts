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
import { BillingRefundMetricsReadService } from './application/billing-refund-metrics-read.service';
import { BillingDisputeMetricsReadService } from './application/billing-dispute-metrics-read.service';
import { BillingQuotaService } from './application/billing-quota.service';
import { BillingStripeFeeService } from './application/billing-stripe-fee.service';
import { BillingStripeFeeMetricsReadService } from './application/billing-stripe-fee-metrics-read.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    BillingService,
    BillingUsageReadService,
    BillingMetricsReadService,
    SubscriptionLifecycleService,
    BillingFinancialMetricsRecorderService,
    BillingFinancialMetricsReadService,
    BillingRefundMetricsReadService,
    BillingDisputeMetricsReadService,
    BillingQuotaService,
    BillingStripeFeeService,
    BillingStripeFeeMetricsReadService,
    StripeAdapter,
    PlanEntitlementGuard,
  ],
  controllers: [BillingController],
  exports: [
    BillingService,
    BillingUsageReadService,
    BillingMetricsReadService,
    BillingFinancialMetricsReadService,
    BillingRefundMetricsReadService,
    BillingDisputeMetricsReadService,
    BillingQuotaService,
    BillingStripeFeeMetricsReadService,
    StripeAdapter,
    PlanEntitlementGuard,
  ],
})
export class BillingModule {}

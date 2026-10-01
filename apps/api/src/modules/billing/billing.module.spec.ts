import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BillingModule } from './billing.module';
import { BillingUsageReadService } from './application/billing-usage-read.service';
import { BillingMetricsReadService } from './application/billing-metrics-read.service';
import { SubscriptionLifecycleService } from './application/subscription-lifecycle.service';
import { BillingFinancialMetricsReadService } from './application/billing-financial-metrics-read.service';
import { BillingFinancialMetricsRecorderService } from './application/billing-financial-metrics-recorder.service';
import { BillingQuotaService } from './application/billing-quota.service';

describe('BillingModule', () => {
  it('registers, exports, and compiles the read-only Billing services', async () => {
    const providers = Reflect.getMetadata('providers', BillingModule) as unknown[];
    const exports = Reflect.getMetadata('exports', BillingModule) as unknown[];
    expect(providers).toEqual(
      expect.arrayContaining([
        BillingUsageReadService,
        BillingMetricsReadService,
        SubscriptionLifecycleService,
        BillingFinancialMetricsReadService,
        BillingFinancialMetricsRecorderService,
        BillingQuotaService,
      ]),
    );
    expect(exports).toEqual(
      expect.arrayContaining([
        BillingUsageReadService,
        BillingMetricsReadService,
        BillingFinancialMetricsReadService,
        BillingQuotaService,
      ]),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingUsageReadService,
        BillingMetricsReadService,
        BillingFinancialMetricsReadService,
        BillingFinancialMetricsRecorderService,
        BillingQuotaService,
        { provide: PrismaService, useValue: { user: { findUnique: jest.fn() } } },
        SubscriptionLifecycleService,
      ],
    }).compile();

    expect(moduleRef.get(BillingUsageReadService)).toBeInstanceOf(
      BillingUsageReadService,
    );
    expect(moduleRef.get(BillingMetricsReadService)).toBeInstanceOf(
      BillingMetricsReadService,
    );
    expect(moduleRef.get(SubscriptionLifecycleService)).toBeInstanceOf(
      SubscriptionLifecycleService,
    );
    expect(moduleRef.get(BillingFinancialMetricsReadService)).toBeInstanceOf(
      BillingFinancialMetricsReadService,
    );
    expect(moduleRef.get(BillingFinancialMetricsRecorderService)).toBeInstanceOf(
      BillingFinancialMetricsRecorderService,
    );
    await moduleRef.close();
  });
});

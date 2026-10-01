import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BillingModule } from './billing.module';
import { BillingUsageReadService } from './application/billing-usage-read.service';
import { BillingMetricsReadService } from './application/billing-metrics-read.service';
import { SubscriptionLifecycleService } from './application/subscription-lifecycle.service';

describe('BillingModule', () => {
  it('registers, exports, and compiles the read-only Billing services', async () => {
    const providers = Reflect.getMetadata('providers', BillingModule) as unknown[];
    const exports = Reflect.getMetadata('exports', BillingModule) as unknown[];
    expect(providers).toEqual(
      expect.arrayContaining([
        BillingUsageReadService,
        BillingMetricsReadService,
        SubscriptionLifecycleService,
      ]),
    );
    expect(exports).toEqual(
      expect.arrayContaining([
        BillingUsageReadService,
        BillingMetricsReadService,
      ]),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingUsageReadService,
        BillingMetricsReadService,
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
    await moduleRef.close();
  });
});

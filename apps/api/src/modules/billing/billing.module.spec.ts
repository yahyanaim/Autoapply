import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BillingModule } from './billing.module';
import { BillingUsageReadService } from './application/billing-usage-read.service';

describe('BillingModule', () => {
  it('registers, exports, and compiles the read-only usage service', async () => {
    const providers = Reflect.getMetadata('providers', BillingModule) as unknown[];
    const exports = Reflect.getMetadata('exports', BillingModule) as unknown[];
    expect(providers).toEqual(expect.arrayContaining([BillingUsageReadService]));
    expect(exports).toEqual(expect.arrayContaining([BillingUsageReadService]));

    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingUsageReadService,
        { provide: PrismaService, useValue: { user: { findUnique: jest.fn() } } },
      ],
    }).compile();

    expect(moduleRef.get(BillingUsageReadService)).toBeInstanceOf(
      BillingUsageReadService,
    );
    await moduleRef.close();
  });
});

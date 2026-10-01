import { Injectable } from '@nestjs/common';
import {
  BillingQuotaService,
  BillingUsageSummary,
} from './billing-quota.service';

export type { BillingUsageCategorySummary, BillingUsageSummary } from './billing-quota.service';

@Injectable()
export class BillingUsageReadService {
  constructor(private readonly quota: BillingQuotaService) {}

  async getUsageSummaryForAdmin(userId: string): Promise<BillingUsageSummary> {
    return this.quota.getUsageSummaryForAdmin(userId);
  }
}

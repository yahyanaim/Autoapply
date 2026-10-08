import { Injectable } from '@nestjs/common';
import { BillingVerifiedWebhookService } from '../../billing/application/billing-verified-webhook.service';

@Injectable()
export class AdminVerifiedWebhooksService {
  constructor(private readonly billing: BillingVerifiedWebhookService) {}

  async list(input: { from: string; to: string; cursor?: string; limit?: number;
    state?: 'unresolved' | 'retryable' | 'resolved' }) {
    const result = await this.billing.list(input);
    return {
      coverage: result.coverage,
      coverageStartAt: result.coverageStartAt,
      requestedRange: { from: result.requestedRange.from,
        toExclusive: result.requestedRange.toExclusive },
      coveredRange: result.coveredRange ? { from: result.coveredRange.from,
        toExclusive: result.coveredRange.toExclusive } : null,
      asOf: result.asOf,
      items: result.items.map((item) => ({
        id: item.id,
        eventType: item.eventType,
        status: item.status,
        reason: item.reason,
        observedAt: item.observedAt,
        finishedAt: item.finishedAt,
        resolvedAt: item.resolvedAt,
        retryEligible: item.retryEligible,
        retryStatus: item.retryStatus,
      })),
      limit: result.limit,
      nextCursor: result.nextCursor,
    };
  }
}

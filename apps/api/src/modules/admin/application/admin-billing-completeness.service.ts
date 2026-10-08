import { Injectable } from '@nestjs/common';
import { BillingEventCompletenessService } from '../../billing/application/billing-event-completeness.service';

@Injectable()
export class AdminBillingCompletenessService {
  constructor(private readonly billing: BillingEventCompletenessService) {}

  async get(input: { from: string; to: string; scanId?: string; cursor?: string; limit?: number }) {
    const scanId = input.scanId ?? await this.billing.scan({ from: input.from, to: input.to });
    const result = await this.billing.getPage({
      scanId, from: input.from, to: input.to, cursor: input.cursor, limit: input.limit,
    });
    // A second explicit boundary prevents future Billing additions from being
    // exposed by the Admin API without an intentional contract change.
    return {
      scanId: result.scanId,
      status: result.status,
      reason: result.reason,
      requestedRange: {
        from: result.requestedRange.from,
        toExclusive: result.requestedRange.toExclusive,
      },
      attemptedRange: result.attemptedRange ? {
        from: result.attemptedRange.from,
        toExclusive: result.attemptedRange.toExclusive,
      } : null,
      verifiedCoveredRange: result.verifiedCoveredRange ? {
        from: result.verifiedCoveredRange.from,
        toExclusive: result.verifiedCoveredRange.toExclusive,
      } : null,
      asOf: result.asOf,
      completedAt: result.completedAt,
      scannedEventCount: result.scannedEventCount,
      findings: result.findings.map((item) => ({
        id: item.id, eventType: item.eventType, eventAt: item.eventAt, finding: item.finding,
      })),
      limit: result.limit,
      nextCursor: result.nextCursor,
    };
  }
}

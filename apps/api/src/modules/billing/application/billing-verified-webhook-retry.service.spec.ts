import {
  BillingEvidenceComponent,
  BillingEvidenceState,
  BillingVerifiedWebhookReason,
  BillingVerifiedWebhookState,
} from '@prisma/client';
import { BillingVerifiedWebhookRetryService } from './billing-verified-webhook-retry.service';

describe('BillingVerifiedWebhookRetryService local eligibility', () => {
  const now = new Date();
  const delivery = {
    id: 'clocaldelivery000000000000', eventId: 'evt_synthetic123',
    eventType: 'invoice.payment_succeeded',
    eventCreatedAt: new Date(now.getTime() - 60_000),
    state: BillingVerifiedWebhookState.retryable_failure,
    reason: BillingVerifiedWebhookReason.provider_unavailable,
    observedAt: new Date(now.getTime() - 60_000), resolvedAt: null,
  };
  const evidence = {
    sourceStripeEventId: delivery.eventId,
    eventType: delivery.eventType,
    component: BillingEvidenceComponent.stripe_fee,
    state: BillingEvidenceState.pending,
    attempts: 1, leaseExpiresAt: null,
    adminRetryDeliveryId: null, adminRetryKeyHash: null,
  };
  const cases = jest.fn();
  const receipts = jest.fn();
  const service = new BillingVerifiedWebhookRetryService({
    billingFinancialEvidenceCase: { findMany: cases },
    stripeWebhookEvent: { findMany: receipts },
  } as never);

  beforeEach(() => {
    cases.mockReset().mockResolvedValue([evidence]);
    receipts.mockReset().mockResolvedValue([]);
  });

  it('offers a bounded candidate only for a classified, unleased, pending financial case', async () => {
    const result = await service.describePage([delivery]);
    expect(result.get(delivery.id)).toEqual({ retryEligible: true, retryStatus: 'none' });
    expect(cases).toHaveBeenCalledWith(expect.objectContaining({ where: {
      sourceStripeEventId: { in: [delivery.eventId] },
      component: BillingEvidenceComponent.stripe_fee,
    } }));
  });

  it.each([
    ['unclassified', { state: BillingVerifiedWebhookState.unclassified_failure }],
    ['resolved', { resolvedAt: now }],
    ['unsupported class', { eventType: 'checkout.session.completed' }],
    ['future Stripe event', { eventCreatedAt: new Date(now.getTime() + 60_000) }],
    ['old Stripe event', { eventCreatedAt: new Date(now.getTime() - 30 * 86_400_000) }],
    ['legacy missing event time', { eventCreatedAt: null }],
  ])('keeps %s inspection-only', async (_name, change) => {
    const row = { ...delivery, ...change };
    const result = await service.describePage([row]);
    expect(result.get(row.id)?.retryEligible).toBe(false);
  });

  it('rejects processed, exhausted, leased, mismatched, and already-requested cases', async () => {
    receipts.mockResolvedValueOnce([{ eventId: delivery.eventId }]);
    expect((await service.describePage([delivery])).get(delivery.id)?.retryEligible).toBe(false);
    for (const change of [
      { attempts: 5 }, { leaseExpiresAt: new Date(Date.now() + 60_000) },
      { eventType: 'refund.created' }, { adminRetryKeyHash: 'synthetic-hash' },
    ]) {
      cases.mockResolvedValueOnce([{ ...evidence, ...change }]);
      expect((await service.describePage([delivery])).get(delivery.id)?.retryEligible).toBe(false);
    }
  });

  it('shows only safe pending, processed, or needs-review results for the selected delivery', async () => {
    cases.mockResolvedValueOnce([{ ...evidence, adminRetryDeliveryId: delivery.id,
      adminRetryKeyHash: 'synthetic-hash' }]);
    expect((await service.describePage([delivery])).get(delivery.id)).toEqual({
      retryEligible: false, retryStatus: 'pending',
    });
    cases.mockResolvedValueOnce([{ ...evidence, adminRetryDeliveryId: delivery.id,
      adminRetryKeyHash: 'synthetic-hash' }]);
    receipts.mockResolvedValueOnce([{ eventId: delivery.eventId }]);
    expect((await service.describePage([delivery])).get(delivery.id)?.retryStatus).toBe('processed');
    cases.mockResolvedValueOnce([{ ...evidence, attempts: 5,
      adminRetryDeliveryId: delivery.id, adminRetryKeyHash: 'synthetic-hash' }]);
    expect((await service.describePage([delivery])).get(delivery.id)?.retryStatus).toBe('needs_review');
  });
});

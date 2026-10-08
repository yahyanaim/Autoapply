import { AdminVerifiedWebhooksService } from './admin-verified-webhooks.service';

describe('AdminVerifiedWebhooksService', () => {
  it('explicitly projects top-level and nested fields without provider identifiers', async () => {
    const billing = { list: jest.fn().mockResolvedValue({
      coverage: 'partial', coverageStartAt: '2026-10-08T00:00:00.000Z',
      requestedRange: { from: '2026-10-08T00:00:00.000Z', toExclusive: '2026-10-09T00:00:00.000Z', secret: 'hidden' },
      coveredRange: { from: '2026-10-08T12:00:00.000Z', toExclusive: '2026-10-08T13:00:00.000Z', secret: 'hidden' },
      asOf: '2026-10-08T13:00:00.000Z', limit: 20, nextCursor: null,
      items: [{ id: 'local_delivery1', eventType: 'invoice.payment_succeeded',
        status: 'unresolved', reason: 'processing_error', observedAt: '2026-10-08T12:00:00.000Z',
        finishedAt: '2026-10-08T12:00:01.000Z', resolvedAt: null,
        eventId: 'evt_private', customerId: 'cus_private', payload: 'secret' }],
      rawStripeError: 'private',
    }) };
    const result = await new AdminVerifiedWebhooksService(billing as never).list({
      from: '2026-10-08', to: '2026-10-08', limit: 20,
    });
    expect(result.items).toEqual([{ id: 'local_delivery1', eventType: 'invoice.payment_succeeded',
      status: 'unresolved', reason: 'processing_error', observedAt: '2026-10-08T12:00:00.000Z',
      finishedAt: '2026-10-08T12:00:01.000Z', resolvedAt: null }]);
    expect(JSON.stringify(result)).not.toMatch(/evt_private|cus_private|payload|rawStripeError|hidden/);
  });
});

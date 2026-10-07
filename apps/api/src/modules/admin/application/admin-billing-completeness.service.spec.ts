import { AdminBillingCompletenessService } from './admin-billing-completeness.service';

describe('AdminBillingCompletenessService', () => {
  const billing = { scan: jest.fn(), getPage: jest.fn() };
  const service = new AdminBillingCompletenessService(billing as never);
  beforeEach(() => {
    jest.clearAllMocks();
    billing.scan.mockResolvedValue('local_scan1');
    billing.getPage.mockResolvedValue({
      scanId: 'local_scan1', status: 'completed', reason: null,
      requestedRange: { from: '2026-10-05T00:00:00.000Z', toExclusive: '2026-10-06T00:00:00.000Z',
        secret: 'not-for-admin' },
      attemptedRange: null, verifiedCoveredRange: null,
      asOf: '2026-10-07T12:00:00.000Z', completedAt: '2026-10-07T12:00:01.000Z',
      scannedEventCount: 1, findings: [{ id: 'local_finding1', eventType: 'refund.updated',
        eventAt: '2026-10-05T13:00:00.000Z', finding: 'missing_receipt',
        sourceStripeEventId: 'evt_private', customerId: 'cus_private', payload: { secret: 'private' } }],
      limit: 20, nextCursor: null, rawProviderError: 'private',
    });
  });

  it('returns an explicit top-level and nested allow-list', async () => {
    const result = await service.get({ from: '2026-10-05', to: '2026-10-05' });
    expect(billing.scan).toHaveBeenCalledWith({ from: '2026-10-05', to: '2026-10-05' });
    expect(result).toEqual({
      scanId: 'local_scan1', status: 'completed', reason: null,
      requestedRange: { from: '2026-10-05T00:00:00.000Z', toExclusive: '2026-10-06T00:00:00.000Z' },
      attemptedRange: null, verifiedCoveredRange: null,
      asOf: '2026-10-07T12:00:00.000Z', completedAt: '2026-10-07T12:00:01.000Z',
      scannedEventCount: 1, findings: [{ id: 'local_finding1', eventType: 'refund.updated',
        eventAt: '2026-10-05T13:00:00.000Z', finding: 'missing_receipt' }],
      limit: 20, nextCursor: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/evt_private|cus_private|payload|not-for-admin|rawProviderError/);
  });

  it('pages an existing durable scan without contacting Stripe again', async () => {
    await service.get({ from: '2026-10-05', to: '2026-10-05', scanId: 'local_scan1', cursor: 'local_finding1' });
    expect(billing.scan).not.toHaveBeenCalled();
    expect(billing.getPage).toHaveBeenCalledWith({
      from: '2026-10-05', to: '2026-10-05', scanId: 'local_scan1', cursor: 'local_finding1', limit: undefined,
    });
  });

  it.each([['failed', 'provider_or_comparison_failure'], ['incomplete', 'provider_page_cap']] as const)(
    'allow-lists attempted but never a verified range for a %s listing', async (status, reason) => {
      billing.getPage.mockResolvedValueOnce({
        scanId: 'local_scan1', status, reason,
        requestedRange: { from: '2026-10-05T00:00:00.000Z', toExclusive: '2026-10-06T00:00:00.000Z' },
        attemptedRange: { from: '2026-10-05T12:00:00.000Z',
          toExclusive: '2026-10-06T00:00:00.000Z', rawEventId: 'evt_private' },
        verifiedCoveredRange: null, asOf: '2026-10-07T12:00:00.000Z', completedAt: null,
        scannedEventCount: 500, findings: [], limit: 20, nextCursor: null,
      });
      const result = await service.get({ from: '2026-10-05', to: '2026-10-05' });
      expect(result.status).toBe(status);
      expect(result.reason).toBe(reason);
      expect(result.attemptedRange).not.toBeNull();
      expect(result.verifiedCoveredRange).toBeNull();
      expect(JSON.stringify(result)).not.toContain('evt_private');
    },
  );
});

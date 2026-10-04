import { BillingStripeFeeService } from './billing-stripe-fee.service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const at = new Date('2026-10-04T12:00:00.000Z');
const event = (type: string, object: object, id = 'evt_fee1') => ({
  id, type, created: Math.floor(at.getTime() / 1000), data: { object },
}) as never;
const transaction = (id: string, fee: number, currency = 'usd') => ({
  id, fee, currency, created: Math.floor(at.getTime() / 1000),
}) as never;

describe('BillingStripeFeeService', () => {
  const adapter = {
    retrievePaymentIntent: jest.fn(), retrieveCharge: jest.fn(),
    retrieveRefund: jest.fn(), retrieveBalanceTransaction: jest.fn(),
  };
  const service = new BillingStripeFeeService(adapter as never);
  beforeEach(() => jest.resetAllMocks());

  it('retrieves authoritative BalanceTransaction.fee through invoice intent and charge, never estimating', async () => {
    adapter.retrievePaymentIntent.mockResolvedValue({ id: 'pi_test1', latest_charge: 'ch_test1' });
    adapter.retrieveCharge.mockResolvedValue({ id: 'ch_test1', balance_transaction: 'txn_test1' });
    adapter.retrieveBalanceTransaction.mockResolvedValue(transaction('txn_test1', 37));
    const prepared = await service.prepare(event('invoice.payment_succeeded', {
      payment_intent: 'pi_test1', amount_paid: 9900,
    }));
    expect(prepared?.balanceTransaction?.fee).toBe(37);
    expect(adapter.retrieveBalanceTransaction).toHaveBeenCalledWith('txn_test1');
    expect(await service.prepare(event('invoice.payment_succeeded', {
      payment_intent: null, amount_paid: 9900,
    }))).toEqual({ balanceTransaction: null, missingFee: false });
    expect(await service.prepare(event('customer.created', { id: 'cus_test1' }))).toBeNull();
  });

  it('preserves retry on transient provider lookup failure and marks missing fee evidence', async () => {
    adapter.retrieveRefund.mockResolvedValue({ id: 're_test1', balance_transaction: 'txn_test1' });
    adapter.retrieveBalanceTransaction.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(service.prepare(event('refund.updated', { id: 're_test1' })))
      .rejects.toThrow('provider unavailable');
    adapter.retrieveBalanceTransaction.mockResolvedValueOnce({
      id: 'txn_test1', currency: 'usd', created: Math.floor(at.getTime() / 1000),
    });
    expect((await service.prepare(event('refund.updated', { id: 're_test1' })))?.missingFee).toBe(true);
  });

  it('stores an explicit non-monetary observation when no authoritative transaction exists', async () => {
    const tx = { billingStripeFeeObservation: { create: jest.fn() } };
    await service.recordInTransaction(tx as never, 'evt_missing', {
      balanceTransaction: null, missingFee: false,
    }, at);
    expect(tx.billingStripeFeeObservation.create).toHaveBeenCalledWith({ data: {
      sourceStripeEventId: 'evt_missing',
      resolution: 'missing_authoritative_transaction',
      balanceTransactionId: null,
      observedAt: at,
    } });
    expect(Object.keys(tx)).toEqual(['billingStripeFeeObservation']);
  });

  it.each([
    [45, 'recorded', 45n, 1],
    [-17, 'recorded', -17n, 1],
    [0, 'zero_fee', null, 0],
  ])('records exact signed fee %s with resolution %s', async (fee, expected, amount, updates) => {
    const tx = {
      billingStripeFeeMetricsBoundary: { findUniqueOrThrow: jest.fn().mockResolvedValue({
        metricsStartAt: new Date('2026-10-03T12:00:00.000Z'), currency: 'usd',
      }) },
      billingStripeFeeEffect: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      billingDailyStripeFeeMetric: { upsert: jest.fn() },
      billingStripeFeeObservation: { create: jest.fn() },
    };
    await service.recordInTransaction(tx as never, 'evt_fee1', {
      balanceTransaction: transaction('txn_test1', fee), missingFee: false,
    }, at);
    expect(tx.billingStripeFeeObservation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      resolution: expected, balanceTransactionId: 'txn_test1',
    }) });
    expect(tx.billingDailyStripeFeeMetric.upsert).toHaveBeenCalledTimes(updates);
    if (amount !== null) {
      expect(tx.billingStripeFeeEffect.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ feeMinor: amount })], skipDuplicates: true,
      });
    }
  });

  it('excludes pre-boundary and non-USD fees and deduplicates a second event for the same transaction', async () => {
    const tx = {
      billingStripeFeeMetricsBoundary: { findUniqueOrThrow: jest.fn().mockResolvedValue({
        metricsStartAt: new Date('2026-10-04T00:00:00.000Z'), currency: 'usd',
      }) },
      billingStripeFeeEffect: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ feeMinor: 20n, currency: 'usd', effectiveAt: at }),
      },
      billingDailyStripeFeeMetric: { upsert: jest.fn() },
      billingStripeFeeObservation: { create: jest.fn() },
    };
    await service.recordInTransaction(tx as never, 'evt_one', {
      balanceTransaction: transaction('txn_test1', 20, 'eur'), missingFee: false,
    }, at);
    expect(tx.billingStripeFeeObservation.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      resolution: 'unsupported_currency',
    }) });
    await service.recordInTransaction(tx as never, 'evt_two', {
      balanceTransaction: { id: 'txn_test1', fee: 20, currency: 'usd', created: Math.floor(new Date('2026-10-03T23:00:00Z').getTime() / 1000) } as never,
      missingFee: false,
    }, at);
    expect(tx.billingStripeFeeObservation.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      resolution: 'pre_boundary',
    }) });
    await service.recordInTransaction(tx as never, 'evt_three', {
      balanceTransaction: transaction('txn_test1', 20), missingFee: false,
    }, at);
    expect(tx.billingStripeFeeObservation.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      resolution: 'duplicate_balance_transaction',
    }) });
    expect(tx.billingDailyStripeFeeMetric.upsert).not.toHaveBeenCalled();
  });
});

describe('Stripe fee boundary migration contract', () => {
  it('inserts the UTC boundary explicitly rather than relying on the PostgreSQL session timezone', () => {
    const migration = readFileSync(join(__dirname,
      '../../../database/prisma/migrations/20261003000000_stripe_fee_ledger/migration.sql'), 'utf8');
    expect(migration).toMatch(
      /VALUES\s*\(\s*'stripe_fees_v1',\s*CURRENT_TIMESTAMP\s+AT\s+TIME\s+ZONE\s+'UTC',\s*'usd'\s*\)/i,
    );
  });
});

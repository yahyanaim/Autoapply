import type Stripe from 'stripe';

export type DisputeMovementEventType =
  | 'charge.dispute.funds_withdrawn'
  | 'charge.dispute.funds_reinstated';

export function isDisputeMovementEvent(
  type: string,
): type is DisputeMovementEventType {
  return type === 'charge.dispute.funds_withdrawn' ||
    type === 'charge.dispute.funds_reinstated';
}

export function selectDisputeMovement(
  dispute: unknown,
  eventType: DisputeMovementEventType,
): Pick<Stripe.BalanceTransaction, 'id' | 'amount' | 'currency' | 'created'> | null {
  if (!dispute || typeof dispute !== 'object' ||
    !('balance_transactions' in dispute) ||
    !Array.isArray(dispute.balance_transactions)) return null;

  const direction = eventType === 'charge.dispute.funds_withdrawn' ? -1 : 1;
  const matching = dispute.balance_transactions.filter((value: unknown) => {
    if (!value || typeof value !== 'object') return false;
    const transaction = value as Partial<Stripe.BalanceTransaction>;
    return transaction.object === 'balance_transaction' &&
      typeof transaction.id === 'string' && /^txn_[A-Za-z0-9]+$/.test(transaction.id) &&
      Number.isSafeInteger(transaction.amount) &&
      Math.sign(transaction.amount!) === direction &&
      typeof transaction.currency === 'string' &&
      /^[a-z]{3}$/.test(transaction.currency) &&
      Number.isSafeInteger(transaction.created) && transaction.created! > 0;
  }) as Stripe.BalanceTransaction[];
  // More than one transaction in the same direction is ambiguous without a
  // provider movement identity in the event; never choose one arbitrarily.
  if (matching.length !== 1) return null;
  const { id, amount, currency, created } = matching[0]!;
  return { id, amount, currency, created };
}

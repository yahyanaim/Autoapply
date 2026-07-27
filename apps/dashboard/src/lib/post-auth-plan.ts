export type PaidPlan = 'pro' | 'premium';

const STORAGE_KEY = 'applyai:post-auth-plan';

export function readRequestedPaidPlan(): PaidPlan | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('plan');
  return isPaidPlan(value) ? value : null;
}

export function rememberPostAuthPlan(plan: PaidPlan | null) {
  if (typeof window === 'undefined') return;
  if (plan) window.sessionStorage.setItem(STORAGE_KEY, plan);
  else window.sessionStorage.removeItem(STORAGE_KEY);
}

export function consumePostAuthPlan(): PaidPlan | null {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
  return isPaidPlan(value) ? value : null;
}

export function billingPath(plan: PaidPlan | null): string {
  return plan ? `/billing?plan=${plan}` : '/dashboard';
}

function isPaidPlan(value: string | null): value is PaidPlan {
  return value === 'pro' || value === 'premium';
}

export interface StepUpMfaAttemptState { failedAttempts: number; windowStartedAt: Date; lockedUntil: Date | null; }
export type StepUpMfaLockoutResult = { allowed: true; next: StepUpMfaAttemptState } | { allowed: false; reason: 'locked' | 'max_attempts' };
const WINDOW_MS = 15 * 60_000;
const BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000];

export function nextStepUpMfaFailure(state: StepUpMfaAttemptState | null, now: Date): StepUpMfaLockoutResult {
  if (state?.lockedUntil && state.lockedUntil > now) return { allowed: false, reason: 'locked' };
  const reset = !state || now.getTime() - state.windowStartedAt.getTime() >= WINDOW_MS;
  const attempts = reset ? 1 : state.failedAttempts + 1;
  if (!reset && state!.failedAttempts >= 5) return { allowed: false, reason: 'max_attempts' };
  const backoff = BACKOFF_MS[Math.min(attempts, 4) - 1]!;
  return { allowed: true, next: { failedAttempts: attempts, windowStartedAt: reset ? now : state!.windowStartedAt, lockedUntil: new Date(now.getTime() + backoff) } };
}

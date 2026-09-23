import { nextStepUpMfaFailure } from './admin-step-up-mfa-lockout';
const now = new Date('2026-09-21T00:00:00.000Z');
describe('step-up MFA lockout state machine', () => {
  it.each([[1,30_000],[2,60_000],[3,300_000],[4,900_000],[5,900_000]])('sets failure %i backoff', (failedAttempts, delay) => {
    const state = failedAttempts === 1 ? null : { failedAttempts: failedAttempts - 1, windowStartedAt: now, lockedUntil: null };
    const result = nextStepUpMfaFailure(state, now);
    expect(result).toEqual({ allowed: true, next: expect.objectContaining({ failedAttempts, lockedUntil: new Date(now.getTime()+delay) }) });
  });
  it('rejects an active lock and maximum attempts', () => {
    expect(nextStepUpMfaFailure({ failedAttempts: 1, windowStartedAt: now, lockedUntil: new Date(now.getTime()+1) }, now)).toEqual({ allowed:false, reason:'locked' });
    expect(nextStepUpMfaFailure({ failedAttempts: 5, windowStartedAt: now, lockedUntil: null }, now)).toEqual({ allowed:false, reason:'max_attempts' });
  });
  it('resets at the fifteen-minute boundary', () => {
    const then = new Date(now.getTime()+15*60_000);
    expect(nextStepUpMfaFailure({ failedAttempts:5, windowStartedAt:now, lockedUntil:null }, then)).toEqual({ allowed:true, next: expect.objectContaining({ failedAttempts:1, windowStartedAt:then }) });
  });
});

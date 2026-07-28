import { Reflector } from '@nestjs/core';
import {
  RateLimitRequest,
  UserAwareThrottlerGuard,
} from './user-aware-throttler.guard';

class TestGuard extends UserAwareThrottlerGuard {
  tracker(request: RateLimitRequest) {
    return this.getTracker(request);
  }
}

describe('UserAwareThrottlerGuard', () => {
  const storage = { increment: jest.fn() };
  const jwt = { verifyAsync: jest.fn() };
  const guard = new TestGuard(
    { throttlers: [{ name: 'default', ttl: 60_000, limit: 10 }] },
    storage as never,
    new Reflector(),
    jwt as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('uses an already authenticated user before the IP address', async () => {
    await expect(
      guard.tracker({ user: { id: 'user-1' }, ip: '203.0.113.10' }),
    ).resolves.toBe('user:user-1');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('verifies the bearer token when the global guard runs before auth guards', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-2' });

    await expect(
      guard.tracker({
        headers: { authorization: 'Bearer signed-token' },
        ip: '203.0.113.10',
      }),
    ).resolves.toBe('user:user-2');
    expect(jwt.verifyAsync).toHaveBeenCalledWith('signed-token');
  });

  it('falls back to IP for public traffic and invalid tokens', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid token'));

    await expect(
      guard.tracker({
        headers: { authorization: 'Bearer forged-token' },
        ip: '203.0.113.10',
      }),
    ).resolves.toBe('ip:203.0.113.10');
  });
});

import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  const redis = {
    eval: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    redis.on.mockReturnValue(redis);
    redis.quit.mockResolvedValue('OK');
  });

  it('maps the atomic Redis response to the Nest throttler contract', async () => {
    redis.eval.mockResolvedValue([11, 60, 1, 30]);
    const storage = new RedisThrottlerStorage('redis://unused', redis as never);

    await expect(storage.increment('request-key', 60_000, 10, 30_000, 'login')).resolves.toEqual({
      totalHits: 11,
      timeToExpire: 60,
      isBlocked: true,
      timeToBlockExpire: 30,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'applyai:throttle:login:request-key:count',
      'applyai:throttle:login:request-key:block',
      '60000',
      '10',
      '30000',
    );
  });

  it('fails closed on malformed Redis responses', async () => {
    redis.eval.mockResolvedValue(['invalid']);
    const storage = new RedisThrottlerStorage('redis://unused', redis as never);

    await expect(storage.increment('key', 1_000, 1, 1_000, 'default')).rejects.toThrow(
      'invalid response',
    );
  });

  it('closes its Redis connection during shutdown', async () => {
    const storage = new RedisThrottlerStorage('redis://unused', redis as never);

    await storage.onModuleDestroy();

    expect(redis.quit).toHaveBeenCalledTimes(1);
  });
});

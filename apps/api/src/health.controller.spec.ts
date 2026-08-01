import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = { $queryRaw: jest.fn() };
  const redis = { get: jest.fn() };
  const queue = { client: Promise.resolve(redis) };
  const storage = { checkHealth: jest.fn() };
  const careerChatHealth = { check: jest.fn() };
  const controller = new HealthController(
    prisma as never,
    queue as never,
    storage as never,
    careerChatHealth as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    storage.checkHealth.mockResolvedValue(undefined);
    careerChatHealth.check.mockResolvedValue(undefined);
  });

  it('reports liveness without checking dependencies', () => {
    expect(controller.liveness()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports ready only when PostgreSQL, Redis, and storage respond', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.get.mockResolvedValue(null);

    await expect(controller.readiness()).resolves.toEqual({
      status: 'ready',
      dependencies: {
        database: 'ready',
        redis: 'ready',
        storage: 'ready',
        careerAssistant: 'ready-or-disabled',
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledWith('applyai:health:readiness');
    expect(storage.checkHealth).toHaveBeenCalledTimes(1);
    expect(careerChatHealth.check).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when a required dependency fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database offline'));
    redis.get.mockResolvedValue(null);

    await expect(controller.readiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('reports unavailable when storage fails', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.get.mockResolvedValue(null);
    storage.checkHealth.mockRejectedValue(new Error('storage offline'));

    await expect(controller.readiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('reports the optional Career Assistant as degraded without breaking the API', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.get.mockResolvedValue(null);
    careerChatHealth.check.mockRejectedValue(new Error('provider offline'));

    await expect(controller.readiness()).resolves.toEqual({
      status: 'ready',
      dependencies: {
        database: 'ready',
        redis: 'ready',
        storage: 'ready',
        careerAssistant: 'unavailable',
      },
    });
  });
});

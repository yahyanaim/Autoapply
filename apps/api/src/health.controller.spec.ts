import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = { $queryRaw: jest.fn() };
  const redis = { get: jest.fn() };
  const queue = { client: Promise.resolve(redis) };
  const controller = new HealthController(prisma as never, queue as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports liveness without checking dependencies', () => {
    expect(controller.liveness()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports ready only when PostgreSQL and Redis respond', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.get.mockResolvedValue(null);

    await expect(controller.readiness()).resolves.toEqual({ status: 'ready' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledWith('applyai:health:readiness');
  });

  it('reports unavailable when a required dependency fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database offline'));
    redis.get.mockResolvedValue(null);

    await expect(controller.readiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = { $queryRaw: jest.fn() };
  const freeRedis = { get: jest.fn() };
  const paidRedis = { get: jest.fn() };
  const freeQueue = { client: Promise.resolve(freeRedis) };
  const paidQueue = { client: Promise.resolve(paidRedis) };
  const storage = { checkHealth: jest.fn() };
  const values: Record<string, string> = { AI_EXECUTION_ROLE: 'all' };
  const config = {
    get: jest.fn((key: string, fallback: string) => values[key] ?? fallback),
  };
  const controller = new HealthController(
    prisma as never,
    freeQueue as never,
    paidQueue as never,
    storage as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    values.AI_EXECUTION_ROLE = 'all';
    storage.checkHealth.mockResolvedValue(undefined);
  });

  it('reports liveness without checking dependencies', () => {
    expect(controller.liveness()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports ready only when PostgreSQL, Redis, and storage respond', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    freeRedis.get.mockResolvedValue(null);
    paidRedis.get.mockResolvedValue(null);

    await expect(controller.readiness()).resolves.toEqual({
      status: 'ready',
      dependencies: {
        database: 'ready',
        redis: 'ready',
        storage: 'ready',
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(freeRedis.get).toHaveBeenCalledWith('applyai:health:readiness');
    expect(paidRedis.get).toHaveBeenCalledWith('applyai:health:readiness');
    expect(storage.checkHealth).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when a required dependency fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database offline'));
    freeRedis.get.mockResolvedValue(null);
    paidRedis.get.mockResolvedValue(null);

    await expect(controller.readiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('reports unavailable when storage fails', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    freeRedis.get.mockResolvedValue(null);
    paidRedis.get.mockResolvedValue(null);
    storage.checkHealth.mockRejectedValue(new Error('storage offline'));

    await expect(controller.readiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('does not access the inactive paid queue from a Free-only process', async () => {
    values.AI_EXECUTION_ROLE = 'free';
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    freeRedis.get.mockResolvedValue(null);
    paidRedis.get.mockResolvedValue(null);

    await expect(controller.readiness()).resolves.toEqual(
      expect.objectContaining({ status: 'ready' }),
    );

    expect(freeRedis.get).toHaveBeenCalledTimes(1);
    expect(paidRedis.get).not.toHaveBeenCalled();
  });

});

import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetaRegistrationGateService } from '../application/beta-registration-gate.service';
import { PrismaService } from '../../../database/prisma/prisma.service';

describe('BetaRegistrationGateService', () => {
  const transaction = {
    betaRegistrationGate: {
      updateMany: jest.fn(),
    },
  };
  const config = {
    get: jest.fn(),
  };
  let service: BetaRegistrationGateService;
  const prisma = {
    betaRegistrationGate: { findUnique: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'BETA_MODE') return false;
      if (key === 'BETA_MAX_REGISTRATIONS') return 100;
      return fallback;
    });
    service = new BetaRegistrationGateService(
      config as never as ConfigService,
      prisma as never as PrismaService,
    );
  });

  it('does not touch the gate while beta mode is disabled', async () => {
    await service.claimSlot(transaction as never);

    expect(transaction.betaRegistrationGate.updateMany).not.toHaveBeenCalled();
  });

  it('does not touch the gate when beta mode is unset', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'BETA_MODE') return fallback;
      if (key === 'BETA_MAX_REGISTRATIONS') return 100;
      return fallback;
    });

    await service.claimSlot(transaction as never);

    expect(transaction.betaRegistrationGate.updateMany).not.toHaveBeenCalled();
  });

  it('claims a beta slot with one conditional atomic update', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'BETA_MODE') return true;
      if (key === 'BETA_MAX_REGISTRATIONS') return 100;
      return fallback;
    });
    transaction.betaRegistrationGate.updateMany.mockResolvedValue({ count: 1 });

    await service.claimSlot(transaction as never);

    expect(transaction.betaRegistrationGate.updateMany).toHaveBeenCalledWith({
      where: { id: 'singleton', count: { lt: 100 } },
      data: { count: { increment: 1 } },
    });
  });

  it('rejects a registration when the conditional update claims no slot', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'BETA_MODE') return true;
      if (key === 'BETA_MAX_REGISTRATIONS') return 100;
      return fallback;
    });
    transaction.betaRegistrationGate.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.claimSlot(transaction as never)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it.each([
    [true, 40, 100, 'open', 60],
    [true, 100, 100, 'full', 0],
    [false, 40, 100, 'disabled', 60],
  ] as const)('returns a durable safe gate summary', async (enabled, count, capacity, status, remaining) => {
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'BETA_MODE' ? enabled : key === 'BETA_MAX_REGISTRATIONS' ? capacity : fallback,
    );
    prisma.betaRegistrationGate.findUnique.mockResolvedValue({
      count,
      updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    });

    await expect(service.getAdminSummary()).resolves.toEqual({
      enabled,
      registrationCount: count,
      capacity,
      remainingSlots: remaining,
      status,
      updatedAt: '2026-09-24T00:00:00.000Z',
    });
    expect(prisma.betaRegistrationGate.findUnique).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      select: { count: true, updatedAt: true },
    });
  });
});

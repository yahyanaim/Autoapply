import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../infrastructure/jwt.strategy';

describe('JwtStrategy session enforcement', () => {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('test-jwt-secret-that-is-long-enough'),
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  };
  const prisma = {
    session: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const strategy = new JwtStrategy(config as never, prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('touches and returns an active session', async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    prisma.session.findUnique.mockResolvedValue({
      id: 'session_1',
      userId: 'user_1',
      user: {
        id: 'user_1',
        email: 'person@example.com',
        role: 'user',
      },
    });

    await expect(
      strategy.validate({
        sub: 'user_1',
        sid: 'session_1',
        iat: 1,
        exp: 2,
      }),
    ).resolves.toEqual({
      id: 'user_1',
      email: 'person@example.com',
      role: 'user',
      sessionId: 'session_1',
      mfaVerified: false,
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session_1',
        userId: 'user_1',
        expiresAt: { gt: expect.any(Date) },
        absoluteExpiresAt: { gt: expect.any(Date) },
        lastUsedAt: { gt: expect.any(Date) },
      },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('rejects an idle, revoked, or absolutely expired session', async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      strategy.validate({
        sub: 'user_1',
        sid: 'session_1',
        iat: 1,
        exp: 2,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });
});

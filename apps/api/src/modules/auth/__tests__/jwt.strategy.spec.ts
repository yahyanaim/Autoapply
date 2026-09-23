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
      deleteMany: jest.fn(),
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
        status: 'active',
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

  it('re-checks user status and revokes a suspended user session', async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    prisma.session.findUnique.mockResolvedValue({
      id: 'session_1',
      userId: 'user_1',
      clientType: 'web',
      user: {
        id: 'user_1',
        email: 'person@example.com',
        role: 'user',
        status: 'suspended',
        subscription: null,
      },
    });
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      strategy.validate({
        sub: 'user_1',
        sid: 'session_1',
        iat: 1,
        exp: 2,
      }),
    ).rejects.toThrow('Session is no longer active');
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { id: 'session_1' },
    });
  });

  it('revokes an extension session after a downgrade to Free', async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    prisma.session.findUnique.mockResolvedValue({
      id: 'extension_session',
      userId: 'user_1',
      clientType: 'extension',
      user: {
        id: 'user_1',
        email: 'person@example.com',
        role: 'user',
        status: 'active',
        subscription: { plan: 'free', status: 'active' },
      },
    });
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      strategy.validate({
        sub: 'user_1',
        sid: 'extension_session',
        iat: 1,
        exp: 2,
      }),
    ).rejects.toThrow('A Pro plan is required to use the extension');
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { id: 'extension_session' },
    });
  });
});

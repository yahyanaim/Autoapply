import { PrismaService } from '../src/database/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/application/auth.service';

const runId = `admin-session-revoke-all-${process.pid}-${Date.now()}`;

describe('AuthService administrative bulk session revocation PostgreSQL concurrency', () => {
  let prisma: PrismaService;
  let auth: AuthService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'Integration tests require an isolated DATABASE_URL containing "test"',
      );
    }
    prisma = new PrismaService();
    await prisma.$connect();
    auth = new AuthService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({
      where: { email: { startsWith: runId } },
    });
    await prisma?.$disconnect();
  });

  it('concurrently revokes each target session once, preserves replay history, and returns deterministic counts', async () => {
    const user = await prisma.user.create({
      data: { email: `${runId}@example.test` },
    });
    const expiry = new Date(Date.now() + 60 * 60_000);
    const [first, second] = await Promise.all([
      prisma.session.create({
        data: {
          userId: user.id,
          token: `${runId}-first-token`,
          expiresAt: expiry,
          absoluteExpiresAt: expiry,
        },
      }),
      prisma.session.create({
        data: {
          userId: user.id,
          token: `${runId}-second-token`,
          expiresAt: expiry,
          absoluteExpiresAt: expiry,
        },
      }),
    ]);
    await prisma.refreshTokenHistory.create({
      data: {
        userId: user.id,
        sessionId: first.id,
        tokenHash: `${runId}-replay-evidence`,
        expiresAt: expiry,
      },
    });

    const results = await Promise.all([
      prisma.$transaction((transaction) =>
        auth.revokeAdminOtherSessionsInTransaction(transaction, user.id),
      ),
      prisma.$transaction((transaction) =>
        auth.revokeAdminOtherSessionsInTransaction(transaction, user.id),
      ),
    ]);

    expect(results.map(({ value }) => value.revokedSessionCount).sort()).toEqual([0, 2]);
    await expect(prisma.session.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(
      prisma.refreshTokenHistory.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
    expect(results.every(({ value }) => value.userId === user.id)).toBe(true);
    expect(second.userId).toBe(user.id);
  });

  it('preserves the supplied current session while revoking every other target session', async () => {
    const user = await prisma.user.create({
      data: { email: `${runId}-same-user@example.test` },
    });
    const expiry = new Date(Date.now() + 60 * 60_000);
    const current = await prisma.session.create({
      data: {
        userId: user.id,
        token: `${runId}-current-token`,
        expiresAt: expiry,
        absoluteExpiresAt: expiry,
      },
    });
    await prisma.session.create({
      data: {
        userId: user.id,
        token: `${runId}-other-token`,
        expiresAt: expiry,
        absoluteExpiresAt: expiry,
      },
    });

    const result = await prisma.$transaction((transaction) =>
      auth.revokeAdminOtherSessionsInTransaction(transaction, user.id, current.id),
    );

    expect(result.value).toEqual({ userId: user.id, revokedSessionCount: 1 });
    await expect(prisma.session.findMany({ where: { userId: user.id } })).resolves.toEqual(
      [expect.objectContaining({ id: current.id })],
    );
  });
});

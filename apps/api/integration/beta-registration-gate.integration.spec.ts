import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OAuthProvider } from '@prisma/client';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/application/auth.service';

const safeTestDatabase = process.env.DATABASE_URL?.includes('test') === true;
const describeWithSafeDatabase = safeTestDatabase ? describe : describe.skip;

describeWithSafeDatabase('API integration: beta registration capacity', () => {
  let app: INestApplication;
  let auth: AuthService;
  let prisma: PrismaService;
  let config: ConfigService;
  const marker = `beta-registration-${Date.now()}`;
  const previousBetaMode = process.env.BETA_MODE;
  const previousBetaMaximum = process.env.BETA_MAX_REGISTRATIONS;

  beforeAll(async () => {
    delete process.env.BETA_MODE;
    process.env.BETA_MAX_REGISTRATIONS = '100';
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    config = app.get(ConfigService);
  });

  beforeEach(async () => {
    config.set('BETA_MODE', true);
    config.set('BETA_MAX_REGISTRATIONS', 100);
    await prisma.user.deleteMany({ where: { email: { contains: marker } } });
    await setCounter(0);
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { contains: marker } } });
    await setCounter(0);
    await app?.close();
    restoreEnvironment('BETA_MODE', previousBetaMode);
    restoreEnvironment('BETA_MAX_REGISTRATIONS', previousBetaMaximum);
  });

  it('allows exactly one of two concurrent password registrations at 99 of 100', async () => {
    await setCounter(99);
    const emails = [email('password-final-one'), email('password-final-two')];

    const results = await Promise.allSettled(
      emails.map((candidateEmail) =>
        auth.register(candidateEmail, 'IntegrationPass123!@', undefined, true),
      ),
    );

    expect(results.filter(isFulfilled)).toHaveLength(1);
    expect(results.filter(isRejected)).toHaveLength(1);
    expect(rejectionMessage(results)).toContain('The ApplyAI beta is currently full');
    await expect(counter()).resolves.toBe(100);
    await expect(prisma.user.count({ where: { email: { in: emails } } })).resolves.toBe(1);
  });

  it('allows exactly one of two concurrent first OAuth registrations at 99 of 100', async () => {
    await setCounter(99);
    const profiles = [
      { email: email('oauth-final-one'), provider: OAuthProvider.google, providerId: `${marker}-google-1` },
      { email: email('oauth-final-two'), provider: OAuthProvider.google, providerId: `${marker}-google-2` },
    ];

    const results = await Promise.allSettled(
      profiles.map((profile) => auth.validateOAuthUser(profile)),
    );

    expect(results.filter(isFulfilled)).toHaveLength(1);
    expect(results.filter(isRejected)).toHaveLength(1);
    expect(rejectionMessage(results)).toContain('The ApplyAI beta is currently full');
    await expect(counter()).resolves.toBe(100);
    await expect(
      prisma.user.count({ where: { email: { in: profiles.map((profile) => profile.email) } } }),
    ).resolves.toBe(1);
  });

  it('does not consume another slot when an existing OAuth user signs in', async () => {
    const profile = {
      email: email('oauth-existing'),
      provider: OAuthProvider.github,
      providerId: `${marker}-github-existing`,
    };

    await auth.validateOAuthUser(profile);
    await expect(counter()).resolves.toBe(1);
    await auth.validateOAuthUser(profile);

    await expect(counter()).resolves.toBe(1);
  });

  it.each(['users', 'subscriptions', 'usage_limits'] as const)(
    'rolls back the user and counter when %s creation fails',
    async (table) => {
      const candidateEmail = email(`rollback-${table}`);

      await withFailureTrigger(table, candidateEmail, async () => {
        await expect(
          auth.register(candidateEmail, 'IntegrationPass123!@', undefined, true),
        ).rejects.toThrow('applyai beta integration failure');
      });

      await expect(
        prisma.user.findUnique({ where: { email: candidateEmail } }),
      ).resolves.toBeNull();
      await expect(counter()).resolves.toBe(0);
    },
  );

  it('keeps one slot after sequential and concurrent duplicate password registrations', async () => {
    const sequentialEmail = email('duplicate-sequential');
    await auth.register(sequentialEmail, 'IntegrationPass123!@', undefined, true);
    await expect(
      auth.register(sequentialEmail, 'IntegrationPass123!@', undefined, true),
    ).rejects.toThrow('User with this email already exists');
    await expect(counter()).resolves.toBe(1);

    await setCounter(0);
    const concurrentEmail = email('duplicate-concurrent');
    const results = await Promise.allSettled([
      auth.register(concurrentEmail, 'IntegrationPass123!@', undefined, true),
      auth.register(concurrentEmail, 'IntegrationPass123!@', undefined, true),
    ]);

    expect(results.filter(isFulfilled)).toHaveLength(1);
    expect(results.filter(isRejected)).toHaveLength(1);
    await expect(counter()).resolves.toBe(1);
  });

  it('does not increment the counter while beta mode is false or unset', async () => {
    await setCounter(71);
    config.set('BETA_MODE', false);
    await auth.register(email('beta-disabled'), 'IntegrationPass123!@', undefined, true);
    await expect(counter()).resolves.toBe(71);

    config.set('BETA_MODE', undefined);
    await auth.register(email('beta-unset'), 'IntegrationPass123!@', undefined, true);
    await expect(counter()).resolves.toBe(71);
  });

  it('blocks new registrations below the current maximum without changing the counter', async () => {
    await setCounter(100);
    config.set('BETA_MAX_REGISTRATIONS', 99);

    await expect(
      auth.register(email('lowered-maximum'), 'IntegrationPass123!@', undefined, true),
    ).rejects.toThrow('The ApplyAI beta is currently full');
    await expect(counter()).resolves.toBe(100);
  });

  it('never resets the counter when the configured maximum changes', async () => {
    await setCounter(70);
    config.set('BETA_MAX_REGISTRATIONS', 100);
    await expect(counter()).resolves.toBe(70);
    config.set('BETA_MAX_REGISTRATIONS', 99);
    await expect(counter()).resolves.toBe(70);
  });

  function email(label: string): string {
    return `${label}-${marker}@example.com`;
  }

  async function counter(): Promise<number> {
    const gate = await prisma.betaRegistrationGate.findUniqueOrThrow({
      where: { id: 'singleton' },
      select: { count: true },
    });
    return gate.count;
  }

  async function setCounter(count: number): Promise<void> {
    await prisma?.betaRegistrationGate.upsert({
      where: { id: 'singleton' },
      update: { count },
      create: { id: 'singleton', count },
    });
  }

  async function withFailureTrigger(
    table: 'users' | 'subscriptions' | 'usage_limits',
    candidateEmail: string,
    run: () => Promise<void>,
  ): Promise<void> {
    const trigger = `applyai_beta_failure_${table}`;
    const condition =
      table === 'users'
        ? `NEW."email" = '${candidateEmail}'`
        : `EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW."userId" AND "email" = '${candidateEmail}')`;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION applyai_beta_integration_failure()
        RETURNS trigger AS $$
        BEGIN
          IF ${condition} THEN
            RAISE EXCEPTION 'applyai beta integration failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER "${trigger}"
        BEFORE INSERT ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION applyai_beta_integration_failure();
      `);
      await run();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "${table}";`);
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS applyai_beta_integration_failure();');
    }
  }
});

function isFulfilled(
  result: PromiseSettledResult<unknown>,
): result is PromiseFulfilledResult<unknown> {
  return result.status === 'fulfilled';
}

function isRejected(
  result: PromiseSettledResult<unknown>,
): result is PromiseRejectedResult {
  return result.status === 'rejected';
}

function rejectionMessage(results: PromiseSettledResult<unknown>[]): string {
  return results
    .filter(isRejected)
    .map((result) =>
      result.reason instanceof Error ? result.reason.message : String(result.reason),
    )
    .join(' ');
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

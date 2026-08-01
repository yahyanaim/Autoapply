import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

describe('API integration: refresh-token replay response', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error(
        'Integration tests require an isolated DATABASE_URL containing "test"',
      );
    }
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
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { in: emails } } });
    await app?.close();
  });

  it('revokes the active family, audits, and notifies after an old token is replayed', async () => {
    const email = nextEmail('sequential');
    const registration = await register(app, email);
    const originalCookie = refreshCookie(registration.headers['set-cookie']);

    const rotation = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalCookie)
      .send({})
      .expect(200);
    const rotatedCookie = refreshCookie(rotation.headers['set-cookie']);
    expect(rotatedCookie).not.toBe(originalCookie);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalCookie)
      .send({})
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toContain('refresh token reuse');
      });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.activityLog.count({
        where: { userId: user.id, type: 'auth_token_reuse' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notification.count({
        where: {
          userId: user.id,
          channel: 'in_app',
          title: 'Your ApplyAI session was secured',
        },
      }),
    ).resolves.toBe(1);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotatedCookie)
      .send({})
      .expect(401);
  });

  it('retains replay evidence after logout and emits the security event once', async () => {
    const email = nextEmail('after-logout');
    const registration = await register(app, email);
    const originalCookie = refreshCookie(registration.headers['set-cookie']);

    const rotation = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalCookie)
      .send({})
      .expect(200);
    const rotatedCookie = refreshCookie(rotation.headers['set-cookie']);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', rotatedCookie)
      .send({})
      .expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await expect(
      prisma.refreshTokenHistory.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalCookie)
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalCookie)
      .send({})
      .expect(401);

    await expect(
      prisma.activityLog.count({
        where: { userId: user.id, type: 'auth_token_reuse' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notification.count({
        where: {
          userId: user.id,
          channel: 'in_app',
          title: 'Your ApplyAI session was secured',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.refreshTokenHistory.count({
        where: { userId: user.id, detectedAt: { not: null } },
      }),
    ).resolves.toBe(1);
  });

  it('allows only one simultaneous rotation and revokes the raced family', async () => {
    const email = nextEmail('simultaneous');
    const registration = await register(app, email);
    const originalCookie = refreshCookie(registration.headers['set-cookie']);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', originalCookie)
        .send({}),
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', originalCookie)
        .send({}),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
    const winningResponse = responses.find(({ status }) => status === 200);
    expect(winningResponse).toBeDefined();
    const rotatedCookie = refreshCookie(winningResponse?.headers['set-cookie']);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.activityLog.count({
        where: { userId: user.id, type: 'auth_token_reuse' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notification.count({
        where: {
          userId: user.id,
          channel: 'in_app',
          title: 'Your ApplyAI session was secured',
        },
      }),
    ).resolves.toBe(1);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotatedCookie)
      .send({})
      .expect(401);
  });

  function nextEmail(scenario: string): string {
    const email = `refresh-replay-${scenario}-${Date.now()}-${emails.length}@example.com`;
    emails.push(email);
    return email;
  }
});

function register(app: INestApplication, email: string) {
  return request(app.getHttpServer())
    .post('/auth/register')
    .send({
      email,
      password: 'IntegrationPass123!@',
      acceptDataProcessing: true,
    })
    .expect(201);
}

function refreshCookie(value: string[] | string | undefined): string {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const cookie = values.find((item) => item.startsWith('applyai_refresh='));
  if (!cookie) throw new Error('Expected an ApplyAI refresh cookie');
  return cookie.split(';', 1)[0] ?? '';
}

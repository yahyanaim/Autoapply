import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminVerifiedWebhooksService } from '../application/admin-verified-webhooks.service';
import { AdminWebhookRetryService } from '../application/admin-webhook-retry.service';
import { RequestContextService } from '../../../shared/observability/request-context.service';
import { AdminConsoleVerifiedWebhooksController } from './admin-console-verified-webhooks.controller';

describe('AdminConsoleVerifiedWebhooksController', () => {
  const owning = { list: jest.fn().mockResolvedValue({ coverage: 'unavailable',
    coverageStartAt: '2026-10-08T00:00:00.000Z', requestedRange: {}, coveredRange: null,
    asOf: '2026-10-08T00:00:00.000Z', items: [], limit: 20, nextCursor: null }) };
  const retry = { request: jest.fn().mockResolvedValue({ deliveryId: 'c123456789012345678901234',
    status: 'retry_requested', requestedAt: new Date('2026-10-08T13:00:00.000Z') }) };
  async function app(options: { authenticated?: boolean; role?: UserRole;
    mfa?: boolean; enabled?: boolean } = {}): Promise<INestApplication> {
    const jwt: CanActivate = { canActivate(context: ExecutionContext) {
      if (options.authenticated === false) throw new UnauthorizedException();
      context.switchToHttp().getRequest().user = { id: 'local_admin1', sessionId: 'local_session1',
        role: options.role ?? UserRole.platform_admin, mfaVerified: options.mfa ?? true };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [AdminConsoleVerifiedWebhooksController],
      providers: [{ provide: AdminVerifiedWebhooksService, useValue: owning },
        { provide: AdminWebhookRetryService, useValue: retry },
        { provide: RequestContextService, useValue: { getRequestId: () => 'request_webhook123' } },
        JwtAuthGuard, RolesGuard, Reflector, AdminConsoleEnabledGuard,
        { provide: ConfigService, useValue: { get: jest.fn(() => options.enabled ?? true) } }],
    }).overrideGuard(JwtAuthGuard).useValue(jwt).compile();
    const instance = module.createNestApplication();
    instance.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await instance.init();
    return instance;
  }
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['JWT', { authenticated: false }, 401], ['role', { role: UserRole.user }, 403],
    ['session MFA', { mfa: false }, 403], ['feature flag', { enabled: false }, 403],
  ] as const)('requires %s before Billing delegation', async (_name, options, status) => {
    const instance = await app(options);
    await request(instance.getHttpServer()).get('/admin/console/verified-webhooks?from=2026-10-08&to=2026-10-08').expect(status);
    expect(owning.list).not.toHaveBeenCalled();
    await instance.close();
  });

  it('allows a bounded read and rejects unknown or unbounded query fields', async () => {
    const instance = await app();
    await request(instance.getHttpServer())
      .get('/admin/console/verified-webhooks?from=2026-10-08&to=2026-10-08&limit=20').expect(200);
    expect(owning.list).toHaveBeenCalledWith({ from: '2026-10-08', to: '2026-10-08', limit: 20 });
    await request(instance.getHttpServer())
      .get('/admin/console/verified-webhooks?from=2026-10-08&to=2026-10-08&unknown=1').expect(400);
    await request(instance.getHttpServer())
      .get('/admin/console/verified-webhooks?from=2026-10-08&to=2026-10-08&limit=21').expect(400);
    await instance.close();
  });

  it.each([
    ['JWT', { authenticated: false }, 401], ['role', { role: UserRole.user }, 403],
    ['session MFA', { mfa: false }, 403], ['feature flag', { enabled: false }, 403],
  ] as const)('blocks %s before retry delegation', async (_name, options, status) => {
    const instance = await app(options);
    await request(instance.getHttpServer())
      .post('/admin/console/verified-webhooks/c123456789012345678901234/retry')
      .set('Idempotency-Key', 'synthetic-key-12345')
      .set('X-Admin-Step-Up-Proof', 'synthetic-proof')
      .send({}).expect(status);
    expect(retry.request).not.toHaveBeenCalled();
    await instance.close();
  });

  it('requires a strict local target and headers, then projects only the safe result', async () => {
    const instance = await app();
    const path = '/admin/console/verified-webhooks/c123456789012345678901234/retry';
    await request(instance.getHttpServer()).post(path).send({}).expect(400);
    await request(instance.getHttpServer()).post(path).set('Idempotency-Key', 'synthetic-key-12345')
      .send({ eventId: 'evt_private' }).expect(400);
    await request(instance.getHttpServer())
      .post('/admin/console/verified-webhooks/evt_private/retry')
      .set('Idempotency-Key', 'synthetic-key-12345').send({}).expect(400);
    const response = await request(instance.getHttpServer()).post(path)
      .set('Idempotency-Key', 'synthetic-key-12345')
      .set('X-Admin-Step-Up-Proof', 'synthetic-proof').send({}).expect(200);
    expect(response.body).toEqual({ deliveryId: 'c123456789012345678901234',
      status: 'retry_requested', requestedAt: '2026-10-08T13:00:00.000Z' });
    expect(retry.request).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: 'c123456789012345678901234', idempotencyKey: 'synthetic-key-12345',
      stepUpProof: 'synthetic-proof',
      context: expect.objectContaining({ role: UserRole.platform_admin, mfaVerified: true }),
    }));
    await instance.close();
  });
});

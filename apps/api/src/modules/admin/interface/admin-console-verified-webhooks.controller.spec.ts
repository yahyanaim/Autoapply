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
import { AdminConsoleVerifiedWebhooksController } from './admin-console-verified-webhooks.controller';

describe('AdminConsoleVerifiedWebhooksController', () => {
  const owning = { list: jest.fn().mockResolvedValue({ coverage: 'unavailable',
    coverageStartAt: '2026-10-08T00:00:00.000Z', requestedRange: {}, coveredRange: null,
    asOf: '2026-10-08T00:00:00.000Z', items: [], limit: 20, nextCursor: null }) };
  async function app(options: { authenticated?: boolean; role?: UserRole;
    mfa?: boolean; enabled?: boolean } = {}): Promise<INestApplication> {
    const jwt: CanActivate = { canActivate(context: ExecutionContext) {
      if (options.authenticated === false) throw new UnauthorizedException();
      context.switchToHttp().getRequest().user = { id: 'local_admin1',
        role: options.role ?? UserRole.platform_admin, mfaVerified: options.mfa ?? true };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [AdminConsoleVerifiedWebhooksController],
      providers: [{ provide: AdminVerifiedWebhooksService, useValue: owning },
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
});

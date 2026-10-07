import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminBillingCompletenessService } from '../application/admin-billing-completeness.service';
import { AdminConsoleBillingCompletenessController } from './admin-console-billing-completeness.controller';

describe('AdminConsoleBillingCompletenessController', () => {
  const safe = { scanId: 'local_scan1', status: 'incomplete', reason: 'partial_window',
    requestedRange: { from: '2026-10-05T00:00:00.000Z', toExclusive: '2026-10-06T00:00:00.000Z' },
    attemptedRange: { from: '2026-10-05T12:00:00.000Z', toExclusive: '2026-10-06T00:00:00.000Z' },
    verifiedCoveredRange: { from: '2026-10-05T12:00:00.000Z', toExclusive: '2026-10-06T00:00:00.000Z' },
    asOf: '2026-10-07T12:00:00.000Z', completedAt: '2026-10-07T12:00:01.000Z',
    scannedEventCount: 1, findings: [{ id: 'local_finding1', eventType: 'refund.updated',
      eventAt: '2026-10-05T13:00:00.000Z', finding: 'missing_receipt' }],
    limit: 20, nextCursor: null };
  const owning = { get: jest.fn().mockResolvedValue(safe) };
  async function app(options: { authenticated?: boolean; role?: UserRole;
    mfa?: boolean; enabled?: boolean } = {}): Promise<INestApplication> {
    const jwt: CanActivate = { canActivate(context: ExecutionContext) {
      if (options.authenticated === false) throw new UnauthorizedException();
      context.switchToHttp().getRequest().user = { id: 'local_admin1',
        role: options.role ?? UserRole.platform_admin, mfaVerified: options.mfa ?? true };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [AdminConsoleBillingCompletenessController],
      providers: [{ provide: AdminBillingCompletenessService, useValue: owning },
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
    ['JWT', { authenticated: false }, 401],
    ['role', { role: UserRole.user }, 403],
    ['session MFA', { mfa: false }, 403],
    ['feature flag', { enabled: false }, 403],
  ] as const)('requires %s before Billing delegation', async (_name, options, status) => {
    const instance = await app(options);
    await request(instance.getHttpServer()).get('/admin/console/billing-completeness?from=2026-10-05&to=2026-10-05').expect(status);
    expect(owning.get).not.toHaveBeenCalled();
    await instance.close();
  });

  it('accepts only a strict bounded query and returns a sanitized projection', async () => {
    const instance = await app();
    const result = await request(instance.getHttpServer())
      .get('/admin/console/billing-completeness?from=2026-10-05&to=2026-10-05&limit=20').expect(200);
    expect(result.body).toEqual(safe);
    expect(owning.get).toHaveBeenCalledWith({ from: '2026-10-05', to: '2026-10-05', limit: 20 });
    expect(JSON.stringify(result.body)).not.toMatch(/customer|paymentId|sourceStripeEventId|payload|token|secret|prompt|cv/i);
    await request(instance.getHttpServer())
      .get('/admin/console/billing-completeness?from=2026-10-05&to=2026-10-05&unknown=1').expect(400);
    await request(instance.getHttpServer())
      .get('/admin/console/billing-completeness?from=2026-10-05&to=2026-10-05&limit=21').expect(400);
    await instance.close();
  });
});

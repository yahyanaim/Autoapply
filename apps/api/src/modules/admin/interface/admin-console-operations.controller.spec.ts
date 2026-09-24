import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminOperationsService } from '../application/admin-operations.service';
import { AdminConsoleOperationsController } from './admin-console-operations.controller';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';

describe('AdminConsoleOperationsController', () => {
  const operations = {
    listJobs: jest.fn().mockResolvedValue({ jobs: [], limit: 20, nextCursor: null }),
    getJob: jest.fn(),
    listResumeFailures: jest.fn().mockResolvedValue({ failures: [], limit: 20, nextCursor: null }),
    getResumeFailure: jest.fn(),
    getBetaGate: jest.fn().mockResolvedValue({ enabled: true, registrationCount: 1, capacity: 100, remainingSlots: 99, status: 'open', updatedAt: '2026-09-24T00:00:00.000Z' }),
    getNotifications: jest.fn().mockResolvedValue({ period: { from: '2026-09-23T00:00:00.000Z', to: '2026-09-24T00:00:00.000Z' }, rollup: { total: 0, pending: 0, sent: 0, failed: 0, read: 0 }, failures: [], limit: 20, nextCursor: null }),
    getApplications: jest.fn().mockResolvedValue({ period: { from: '2026-08-24T00:00:00.000Z', to: '2026-09-24T00:00:00.000Z' }, total: 0, byStatus: { draft: 0, submitted: 0, viewed: 0, interview: 0, offer: 0, rejected: 0 } }),
  };

  async function createApp(options: { enabled?: boolean; authenticated?: boolean; user?: { role: UserRole; mfaVerified: boolean } } = {}) {
    const jwtGuard: CanActivate = { canActivate(context: ExecutionContext) { if (options.authenticated === false) throw new UnauthorizedException(); context.switchToHttp().getRequest().user = options.user ?? { id: 'admin', role: UserRole.platform_admin, mfaVerified: true }; return true; } };
    const moduleRef = await Test.createTestingModule({ controllers: [AdminConsoleOperationsController], providers: [{ provide: AdminOperationsService, useValue: operations }, JwtAuthGuard, RolesGuard, Reflector, AdminConsoleEnabledGuard, { provide: ConfigService, useValue: { get: jest.fn(() => options.enabled ?? true) } }] }).overrideGuard(JwtAuthGuard).useValue(jwtGuard).compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    return app;
  }

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['wrong role', { user: { role: UserRole.user, mfaVerified: true } }, 403],
    ['missing MFA', { user: { role: UserRole.platform_admin, mfaVerified: false } }, 403],
    ['disabled', { enabled: false }, 403],
  ] as const)('denies %s before owning-service delegation', async (_name, options, status) => {
    const app = await createApp(options);
    await request(app.getHttpServer()).get('/admin/console/jobs').expect(status);
    expect(operations.listJobs).not.toHaveBeenCalled();
    await app.close();
  });

  it('serves each safe read route and rejects unknown query fields', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/admin/console/jobs').expect(200);
    await request(app.getHttpServer()).get('/admin/console/resume-failures').expect(200);
    await request(app.getHttpServer()).get('/admin/console/beta').expect(200);
    await request(app.getHttpServer()).get('/admin/console/notifications').expect(200);
    await request(app.getHttpServer()).get('/admin/console/applications').expect(200);
    await request(app.getHttpServer()).get('/admin/console/jobs?unknown=value').expect(400);
    expect(JSON.stringify(operations)).not.toMatch(/PrismaService|queryRaw|executeRaw/);
    await app.close();
  });

  it('keeps the Admin throttle and injects no Prisma service', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', AdminConsoleOperationsController)).toBe(50);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', AdminConsoleOperationsController)).toBe(15 * 60_000);
    expect(Reflect.getMetadata('design:paramtypes', AdminConsoleOperationsController)).toEqual([AdminOperationsService]);
  });
});

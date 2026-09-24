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
import { AdminJobsService } from '../application/admin-jobs.service';
import { AdminResumesService } from '../application/admin-resumes.service';
import { RequestContextService } from '../../../shared/observability/request-context.service';

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
  const adminJobs = {
    deactivate: jest.fn().mockResolvedValue({
      jobId: 'ckz8dc7m40000qwertyuiop12',
      status: 'deactivated',
      deactivatedAt: new Date('2026-09-24T10:00:00.000Z'),
      reason: 'invalid_listing',
    }),
  };
  const adminResumes = {
    requeue: jest.fn().mockResolvedValue({
      resumeId: 'ckz8dc7m40000qwertyuiop12',
      requeueRequestId: 'ckz8dc7m40001qwertyuiop12',
      status: 'requeue_requested',
      requestedAt: new Date('2026-09-25T10:00:00.000Z'),
    }),
  };

  async function createApp(options: { enabled?: boolean; authenticated?: boolean; user?: { role: UserRole; mfaVerified: boolean } } = {}) {
    const jwtGuard: CanActivate = { canActivate(context: ExecutionContext) { if (options.authenticated === false) throw new UnauthorizedException(); context.switchToHttp().getRequest().user = options.user ?? { id: 'admin-1', sessionId: 'session-1', role: UserRole.platform_admin, mfaVerified: true }; return true; } };
    const moduleRef = await Test.createTestingModule({ controllers: [AdminConsoleOperationsController], providers: [{ provide: AdminOperationsService, useValue: operations }, { provide: AdminJobsService, useValue: adminJobs }, { provide: AdminResumesService, useValue: adminResumes }, { provide: RequestContextService, useValue: { getRequestId: () => 'request_12345678' } }, JwtAuthGuard, RolesGuard, Reflector, AdminConsoleEnabledGuard, { provide: ConfigService, useValue: { get: jest.fn(() => options.enabled ?? true) } }] }).overrideGuard(JwtAuthGuard).useValue(jwtGuard).compile();
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

  it('validates and delegates job deactivation without direct Prisma access', async () => {
    const app = await createApp();
    const jobId = 'ckz8dc7m40000qwertyuiop12';
    await request(app.getHttpServer())
      .post(`/admin/console/jobs/${jobId}/deactivate`)
      .set('X-Admin-Step-Up-Proof', 'proof-value')
      .send({ reason: 'invalid_listing' })
      .expect(200)
      .expect({
        jobId,
        status: 'deactivated',
        deactivatedAt: '2026-09-24T10:00:00.000Z',
        reason: 'invalid_listing',
      });
    expect(adminJobs.deactivate).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId,
        reason: 'invalid_listing',
        stepUpProof: 'proof-value',
        context: expect.objectContaining({
          actorUserId: 'admin-1',
          sessionId: 'session-1',
        }),
      }),
    );
    await request(app.getHttpServer())
      .post(`/admin/console/jobs/${jobId}/deactivate`)
      .send({ reason: 'not-approved', unknown: true })
      .expect(400);
    await app.close();
  });

  it('validates and delegates a bound idempotent resume requeue', async () => {
    const app = await createApp();
    const resumeId = 'ckz8dc7m40000qwertyuiop12';
    await request(app.getHttpServer())
      .post(`/admin/console/resume-failures/${resumeId}/requeue`)
      .set('X-Admin-Step-Up-Proof', 'proof-value')
      .set('Idempotency-Key', 'resume-requeue-request-0001')
      .send({ reason: 'provider_recovered' })
      .expect(200)
      .expect({
        resumeId,
        requeueRequestId: 'ckz8dc7m40001qwertyuiop12',
        status: 'requeue_requested',
        requestedAt: '2026-09-25T10:00:00.000Z',
      });
    expect(adminResumes.requeue).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeId,
        reason: 'provider_recovered',
        idempotencyKey: 'resume-requeue-request-0001',
        stepUpProof: 'proof-value',
        context: expect.objectContaining({
          actorUserId: 'admin-1',
          sessionId: 'session-1',
        }),
      }),
    );

    await request(app.getHttpServer())
      .post(`/admin/console/resume-failures/${resumeId}/requeue`)
      .set('X-Admin-Step-Up-Proof', 'proof-value')
      .send({ reason: 'not-approved', unexpected: true })
      .expect(400);
    await app.close();
  });

  it('keeps the Admin throttle and injects no Prisma service', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', AdminConsoleOperationsController)).toBe(50);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', AdminConsoleOperationsController)).toBe(15 * 60_000);
    expect(Reflect.getMetadata('design:paramtypes', AdminConsoleOperationsController)).toEqual([
      AdminOperationsService,
      AdminJobsService,
      AdminResumesService,
      RequestContextService,
    ]);
  });
});

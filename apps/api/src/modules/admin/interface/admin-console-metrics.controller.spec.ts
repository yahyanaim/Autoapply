import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminMetricsService } from '../application/admin-metrics.service';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminConsoleMetricsController } from './admin-console-metrics.controller';

describe('AdminConsoleMetricsController', () => {
  const response = {
    period: {
      from: '2026-09-01',
      to: '2026-09-25',
      timeZone: 'UTC',
      maximumDays: 90,
    },
    billing: {
      asOf: '2026-09-25T12:00:00.000Z',
      currency: 'usd',
      activePaidSubscriptions: 3,
      activePaidSubscriptionsByPlan: { pro: 2, premium: 1 },
      monthlyRecurringRevenueMinor: 8_700,
      history: {
        historyAvailableFrom: '2026-09-24T12:00:00.000Z',
        requestedRangeStartsBeforeHistory: true,
        actualCoveredRange: {
          from: '2026-09-24T12:00:00.000Z',
          toExclusive: '2026-09-26T00:00:00.000Z',
        },
        totals: {
          newPaidSubscriptions: 1,
          expansionMrrMinor: 0,
          contractionMrrMinor: 0,
          churnCount: 0,
          churnedMrrMinor: 0,
          reactivationCount: 0,
        },
        daily: [],
      },
    },
    ai: {
      costType: 'estimated',
      currency: 'usd',
      requestCount: 4,
      costedRequestCount: 3,
      estimatedCostUsd: 0.75,
      daily: [],
    },
  };
  const metrics = { getMetrics: jest.fn().mockResolvedValue(response) };

  async function createApp(options: {
    enabled?: boolean;
    authenticated?: boolean;
    user?: { role: UserRole; mfaVerified: boolean };
  } = {}): Promise<INestApplication> {
    const jwtGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        if (options.authenticated === false) throw new UnauthorizedException();
        context.switchToHttp().getRequest().user = options.user ?? {
          id: 'admin-1',
          role: UserRole.platform_admin,
          mfaVerified: true,
        };
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminConsoleMetricsController],
      providers: [
        { provide: AdminMetricsService, useValue: metrics },
        JwtAuthGuard,
        RolesGuard,
        Reflector,
        AdminConsoleEnabledGuard,
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => options.enabled ?? true) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    return app;
  }

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['wrong role', { user: { role: UserRole.user, mfaVerified: true } }, 403],
    [
      'missing MFA',
      { user: { role: UserRole.platform_admin, mfaVerified: false } },
      403,
    ],
    ['disabled feature flag', { enabled: false }, 403],
  ] as const)('denies %s before owning-service delegation', async (_name, options, status) => {
    const app = await createApp(options);
    await request(app.getHttpServer())
      .get('/admin/console/metrics?from=2026-09-01&to=2026-09-25')
      .expect(status);
    expect(metrics.getMetrics).not.toHaveBeenCalled();
    await app.close();
  });

  it('validates the allow-listed UTC query and returns only safe aggregates', async () => {
    const app = await createApp();
    const result = await request(app.getHttpServer())
      .get('/admin/console/metrics?from=2026-09-01&to=2026-09-25')
      .expect(200);

    expect(result.body).toEqual(response);
    expect(metrics.getMetrics).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-25',
    });
    expect(JSON.stringify(result.body)).not.toMatch(
      /stripe|invoice|customer|email|userId|provider|model|prompt|resume|cv|token|credential|secret|paymentInstrument/i,
    );

    await request(app.getHttpServer())
      .get('/admin/console/metrics?from=2026-09-01&to=2026-09-25&unknown=true')
      .expect(400);
    await request(app.getHttpServer())
      .get('/admin/console/metrics?from=2026-09-01T00%3A00%3A00.000Z&to=2026-09-25')
      .expect(400);
    await app.close();
  });

  it('keeps the Admin rate limit and injects no Prisma service', () => {
    expect(
      Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        AdminConsoleMetricsController,
      ),
    ).toBe(50);
    expect(
      Reflect.getMetadata(
        'THROTTLER:TTLdefault',
        AdminConsoleMetricsController,
      ),
    ).toBe(15 * 60_000);
    expect(
      Reflect.getMetadata('design:paramtypes', AdminConsoleMetricsController),
    ).toEqual([AdminMetricsService]);
  });
});

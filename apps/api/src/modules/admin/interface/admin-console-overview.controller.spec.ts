import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminOverviewService } from '../application/admin-overview.service';
import { AdminConsoleOverviewController } from './admin-console-overview.controller';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';

describe('AdminConsoleOverviewController', () => {
  const overview = { getOverview: jest.fn().mockResolvedValue({ suspendedUserCount: 4 }) };

  async function createApp(options?: {
    enabled?: boolean;
    authenticated?: boolean;
    user?: { role: UserRole; mfaVerified: boolean };
  }): Promise<INestApplication> {
    const jwtGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        if (options?.authenticated === false) throw new UnauthorizedException();
        context.switchToHttp().getRequest().user = options?.user ?? {
          id: 'admin-1',
          role: UserRole.platform_admin,
          mfaVerified: true,
        };
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminConsoleOverviewController],
      providers: [
        { provide: AdminOverviewService, useValue: overview },
        JwtAuthGuard,
        RolesGuard,
        Reflector,
        AdminConsoleEnabledGuard,
        { provide: ConfigService, useValue: { get: jest.fn(() => options?.enabled ?? true) } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['non-platform-admin', { user: { role: UserRole.user, mfaVerified: true } }, 403],
    ['MFA-incomplete platform admin', { user: { role: UserRole.platform_admin, mfaVerified: false } }, 403],
    ['disabled feature flag', { enabled: false }, 403],
  ] as const)('denies %s requests without reading the overview', async (_name, options, status) => {
    const app = await createApp(options);
    await request(app.getHttpServer()).get('/admin/console/overview').expect(status);
    expect(overview.getOverview).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns only the aggregate suspended-user count', async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .get('/admin/console/overview')
      .expect(200);

    expect(response.body).toEqual({ suspendedUserCount: 4 });
    expect(overview.getOverview).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(response.body)).not.toMatch(
      /incident|email|session|token|hash|mfa|ip|userAgent|password|cv|resume|prompt|payment|metadata/i,
    );
    await app.close();
  });

  it('keeps the Admin rate limit and no Prisma dependency', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', AdminConsoleOverviewController)).toBe(50);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', AdminConsoleOverviewController)).toBe(15 * 60_000);
    expect(Reflect.getMetadata('design:paramtypes', AdminConsoleOverviewController)).toEqual([AdminOverviewService]);
  });
});

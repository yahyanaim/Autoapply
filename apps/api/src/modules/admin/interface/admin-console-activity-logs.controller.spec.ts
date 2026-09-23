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
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AdminAuditService } from '../application/admin-audit.service';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminConsoleActivityLogsController } from './admin-console-activity-logs.controller';
import { RequestContextService } from '../../../shared/observability/request-context.service';

const safeResponse = {
  events: [{
    id: 'event-2',
    createdAt: '2026-09-21T02:00:00.000Z',
    action: 'admin.user.suspend',
    targetType: 'user',
    targetId: 'user-1',
    actorRef: 'admin-1',
    correlationId: 'request_12345678',
    before: { status: 'active' },
    after: { status: 'suspended', suspendedAt: '2026-09-21T02:00:00.000Z' },
  }],
  limit: 20,
  nextCursor: null,
};

describe('AdminConsoleActivityLogsController', () => {
  const audit = { readForAdmin: jest.fn().mockResolvedValue(safeResponse) };
  const requestContext = { getRequestId: jest.fn(() => 'request_12345678') };

  async function createApp(options?: {
    enabled?: boolean;
    authenticated?: boolean;
    user?: { id?: string; role: UserRole; mfaVerified: boolean };
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
      controllers: [AdminConsoleActivityLogsController],
      providers: [
        { provide: AdminAuditService, useValue: audit },
        { provide: RequestContextService, useValue: requestContext },
        JwtAuthGuard,
        RolesGuard,
        Reflector,
        AdminConsoleEnabledGuard,
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => options?.enabled ?? true) },
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
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    return app;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    requestContext.getRequestId.mockReturnValue('request_12345678');
  });

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['non-platform-admin', { user: { role: UserRole.user, mfaVerified: true } }, 403],
    ['MFA-incomplete platform admin', { user: { role: UserRole.platform_admin, mfaVerified: false } }, 403],
    ['disabled feature flag', { enabled: false }, 403],
  ] as const)('denies %s requests', async (_name, options, status) => {
    const app = await createApp(options);
    await request(app.getHttpServer()).get('/admin/console/activity-logs').expect(status);
    expect(audit.readForAdmin).not.toHaveBeenCalled();
    await app.close();
  });

  it('delegates the bounded allowed filters and returns only the safe activity projection', async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .get('/admin/console/activity-logs?limit=20&action=admin.user.suspend&actorUserId=admin-1&targetType=user&targetId=user-1&createdFrom=2026-09-01T00%3A00%3A00.000Z&createdTo=2026-09-30T00%3A00%3A00.000Z')
      .expect(200);

    expect(response.body).toEqual(safeResponse);
    expect(audit.readForAdmin).toHaveBeenCalledWith(
      {
        limit: 20,
        action: 'admin.user.suspend',
        actorUserId: 'admin-1',
        targetType: 'user',
        targetId: 'user-1',
        createdFrom: '2026-09-01T00:00:00.000Z',
        createdTo: '2026-09-30T00:00:00.000Z',
      },
      { actorUserId: 'admin-1', correlationId: 'request_12345678' },
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|token|hash|mfa|ipAddress|userAgent|authorization|cookie|cv|resume|prompt|document|payment|provider|secret|metadata|requestBody/i,
    );
    await app.close();
  });

  it('rejects unbounded pages, malformed filters, invalid dates, and unknown fields', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/admin/console/activity-logs?limit=101').expect(400);
    await request(app.getHttpServer()).get('/admin/console/activity-logs?action=not%20safe').expect(400);
    await request(app.getHttpServer()).get('/admin/console/activity-logs?createdFrom=invalid').expect(400);
    await request(app.getHttpServer()).get('/admin/console/activity-logs?metadata=private').expect(400);
    expect(audit.readForAdmin).not.toHaveBeenCalled();
    await app.close();
  });

  it('keeps the existing Admin rate limit', () => {
    expect(
      Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        AdminConsoleActivityLogsController,
      ),
    ).toBe(50);
    expect(
      Reflect.getMetadata(
        'THROTTLER:TTLdefault',
        AdminConsoleActivityLogsController,
      ),
    ).toBe(15 * 60_000);
  });

  it('publishes the Swagger route and sanitized response contract', async () => {
    const app = await createApp();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(
      document.paths['/admin/console/activity-logs']?.get?.responses?.['200'],
    ).toBeDefined();
    expect(
      document.paths['/admin/console/activity-logs']?.get?.parameters?.map(
        (parameter) => ('name' in parameter ? parameter.name : undefined),
      ),
    ).toEqual(
      expect.arrayContaining([
        'cursor',
        'limit',
        'action',
        'actorUserId',
        'targetType',
        'targetId',
        'createdFrom',
        'createdTo',
      ]),
    );
    await app.close();
  });
});

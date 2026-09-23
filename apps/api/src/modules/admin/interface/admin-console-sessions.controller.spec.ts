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
import { AdminSessionsService } from '../application/admin-sessions.service';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminConsoleSessionsController } from './admin-console-sessions.controller';

const safeResponse = {
  sessions: [{
    userId: 'user-1',
    sessionId: 'session-current',
    clientType: 'web',
    createdAt: '2026-09-21T00:00:00.000Z',
    lastUsedAt: '2026-09-21T00:05:00.000Z',
    expiresAt: '2026-09-28T00:00:00.000Z',
    current: true,
  }],
  limit: 20,
  nextCursor: null,
};

describe('AdminConsoleSessionsController', () => {
  const sessions = { list: jest.fn().mockResolvedValue(safeResponse) };

  async function createApp(options?: {
    enabled?: boolean;
    authenticated?: boolean;
    user?: { role: UserRole; mfaVerified: boolean; sessionId?: string };
  }): Promise<INestApplication> {
    const jwtGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        if (options?.authenticated === false) throw new UnauthorizedException();
        context.switchToHttp().getRequest().user = options?.user ?? {
          role: UserRole.platform_admin,
          mfaVerified: true,
          sessionId: 'session-current',
        };
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminConsoleSessionsController],
      providers: [
        { provide: AdminSessionsService, useValue: sessions },
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
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await app.init();
    return app;
  }

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 for unauthenticated access', async () => {
    const app = await createApp({ authenticated: false });
    await request(app.getHttpServer()).get('/admin/console/sessions').expect(401);
    await app.close();
  });

  it('returns 403 for a non-platform-admin', async () => {
    const app = await createApp({
      user: { role: UserRole.user, mfaVerified: true },
    });
    await request(app.getHttpServer()).get('/admin/console/sessions').expect(403);
    await app.close();
  });

  it('returns 403 for an MFA-incomplete platform admin', async () => {
    const app = await createApp({
      user: { role: UserRole.platform_admin, mfaVerified: false },
    });
    await request(app.getHttpServer()).get('/admin/console/sessions').expect(403);
    await app.close();
  });

  it('returns 403 when the feature flag is disabled', async () => {
    const app = await createApp({ enabled: false });
    await request(app.getHttpServer()).get('/admin/console/sessions').expect(403);
    await app.close();
  });

  it('returns only sanitized global sessions and approved filters', async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .get('/admin/console/sessions?limit=20&clientType=web&status=active&createdFrom=2026-09-01T00%3A00%3A00.000Z&lastUsedTo=2026-09-30T00%3A00%3A00.000Z')
      .expect(200);
    expect(response.body).toEqual(safeResponse);
    expect(sessions.list).toHaveBeenCalledWith({
      currentSessionId: 'session-current',
      limit: 20,
      clientType: 'web',
      status: 'active',
      createdFrom: '2026-09-01T00:00:00.000Z',
      lastUsedTo: '2026-09-30T00:00:00.000Z',
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /token|hash|mfa|ipAddress|userAgent|authorization|cookie|email|password|secret|cv|resume|prompt|document|payment/i,
    );
    await app.close();
  });

  it('rejects excessive pages, invalid filters, and unknown fields', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/admin/console/sessions?limit=101').expect(400);
    await request(app.getHttpServer()).get('/admin/console/sessions?status=unknown').expect(400);
    await request(app.getHttpServer()).get('/admin/console/sessions?search=email').expect(400);
    await app.close();
  });

  it('publishes the sanitized Swagger response contract', async () => {
    const app = await createApp();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(document.paths['/admin/console/sessions']?.get?.responses?.['200']).toBeDefined();
    await app.close();
  });
});

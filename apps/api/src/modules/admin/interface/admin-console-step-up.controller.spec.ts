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
import { AdminStepUpMfaService } from '../application/admin-step-up-mfa.service';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminConsoleStepUpController } from './admin-console-step-up.controller';

const targetId = 'ckz8dc7m40000qwertyuiop12';
const trustedUser = {
  id: 'ckz8dc7m40000asdfghjklz12',
  sessionId: 'session-1',
  role: UserRole.platform_admin,
  mfaVerified: true,
};
const validRequest = {
  code: '123456',
  action: 'admin.user.suspend',
  targetType: 'user',
  targetId,
};
const validSessionRequest = {
  code: '123456',
  action: 'admin.session.revoke',
  targetType: 'session',
  targetId: '7d397356-f8f8-4f8e-9dce-5571bb1e24e0',
};

describe('AdminConsoleStepUpController', () => {
  const stepUpMfa = {
    issue: jest.fn().mockResolvedValue({
      proof: 'a'.repeat(43),
      expiresAt: new Date('2026-09-21T00:05:00.000Z'),
    }),
  };

  async function createApp(options?: {
    enabled?: boolean;
    authenticated?: boolean;
    user?: {
      id?: string;
      sessionId?: string;
      role: UserRole;
      mfaVerified: boolean;
    };
  }): Promise<INestApplication> {
    const jwtGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        if (options?.authenticated === false) throw new UnauthorizedException();
        context.switchToHttp().getRequest().user = options?.user ?? trustedUser;
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminConsoleStepUpController],
      providers: [
        { provide: AdminStepUpMfaService, useValue: stepUpMfa },
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
      }),
    );
    await app.init();
    return app;
  }

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['non-platform-admin', { user: { ...trustedUser, role: UserRole.user } }, 403],
    ['MFA-incomplete platform admin', { user: { ...trustedUser, mfaVerified: false } }, 403],
    ['disabled feature flag', { enabled: false }, 403],
  ] as const)('denies %s requests without issuing a proof', async (_name, options, status) => {
    const app = await createApp(options);
    await request(app.getHttpServer())
      .post('/admin/console/step-up')
      .send(validRequest)
      .expect(status);
    expect(stepUpMfa.issue).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(['admin.user.suspend', 'admin.user.reactivate'] as const)(
    'issues a single-use proof bound to the authenticated %s request',
    async (action) => {
      const app = await createApp();
      const response = await request(app.getHttpServer())
        .post('/admin/console/step-up')
        .send({ ...validRequest, action })
        .expect(200);

      expect(response.body).toEqual({
        proof: 'a'.repeat(43),
        expiresAt: '2026-09-21T00:05:00.000Z',
      });
      expect(stepUpMfa.issue).toHaveBeenCalledWith(
        {
          actorUserId: trustedUser.id,
          sessionId: trustedUser.sessionId,
          action,
          targetType: 'user',
          targetId,
        },
        '123456',
      );
      expect(JSON.stringify(response.body)).not.toMatch(
        /123456|mfa|token|password|secret|authorization|cookie|ip|userAgent/i,
      );
      await app.close();
    },
  );

  it('issues a proof for the approved user-bound bulk session revocation action', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post('/admin/console/step-up')
      .send({ ...validRequest, action: 'admin.session.revoke_all' })
      .expect(200);
    expect(stepUpMfa.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.session.revoke_all',
        targetType: 'user',
        targetId,
      }),
      '123456',
    );
    await app.close();
  });

  it('issues a proof for the only approved session-revoke binding', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post('/admin/console/step-up')
      .send(validSessionRequest)
      .expect(200);
    expect(stepUpMfa.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.session.revoke',
        targetType: 'session',
        targetId: validSessionRequest.targetId,
      }),
      '123456',
    );
    await app.close();
  });

  it('issues a proof only for the approved job-deactivation binding', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post('/admin/console/step-up')
      .send({
        ...validRequest,
        action: 'admin.job.deactivate',
        targetType: 'job',
      })
      .expect(200);
    expect(stepUpMfa.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.job.deactivate',
        targetType: 'job',
        targetId,
      }),
      '123456',
    );
    await app.close();
  });

  it('issues a proof only for the approved resume-requeue binding', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post('/admin/console/step-up')
      .send({
        ...validRequest,
        action: 'admin.resume.requeue',
        targetType: 'resume',
      })
      .expect(200);
    expect(stepUpMfa.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.resume.requeue',
        targetType: 'resume',
        targetId,
      }),
      '123456',
    );
    await app.close();
  });

  it.each([
    [{ ...validRequest, action: 'admin.user.delete' }],
    [{ ...validRequest, targetType: 'organization' }],
    [{ ...validRequest, targetId: 'not-a-cuid' }],
    [{ ...validRequest, code: 'not-a-totp' }],
    [{ ...validRequest, unexpected: 'field' }],
    [{ ...validRequest, actorUserId: 'attacker', sessionId: 'attacker-session' }],
    { ...validSessionRequest, targetType: 'user' },
    { ...validRequest, targetType: 'session', targetId: validSessionRequest.targetId },
    { ...validRequest, action: 'admin.job.deactivate', targetType: 'user' },
    { ...validRequest, action: 'admin.resume.requeue', targetType: 'user' },
  ])('rejects unsupported, malformed, or client-supplied binding input', async (body) => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post('/admin/console/step-up')
      .send(body)
      .expect(400);
    expect(stepUpMfa.issue).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns the existing generic authentication error for invalid TOTP or lockout', async () => {
    stepUpMfa.issue.mockRejectedValueOnce(
      new UnauthorizedException('Step-up verification failed'),
    );
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post('/admin/console/step-up')
      .send(validRequest)
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({ message: 'Step-up verification failed' }),
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /123456|totp|lock|attempt|proof|secret/i,
    );
    await app.close();
  });

  it('uses the established Admin rate limit and publishes Swagger contracts', async () => {
    expect(
      Reflect.getMetadata('THROTTLER:LIMITdefault', AdminConsoleStepUpController),
    ).toBe(50);
    expect(
      Reflect.getMetadata('THROTTLER:TTLdefault', AdminConsoleStepUpController),
    ).toBe(15 * 60_000);

    const app = await createApp();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(document.paths['/admin/console/step-up']?.post?.responses?.['200']).toBeDefined();
    await app.close();
  });
});

import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AdminUsersService } from '../application/admin-users.service';
import { AdminSessionsService } from '../application/admin-sessions.service';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminConsoleUsersController } from './admin-console-users.controller';
import { RequestContextService } from '../../../shared/observability/request-context.service';

const safeUser = {
  id: 'user-1',
  email: 'user@example.com',
  role: UserRole.user,
  status: 'active',
  plan: 'free',
  isEmailVerified: true,
  suspendedAt: null,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
};
const safeSession = {
  id: 'session-1',
  clientType: 'web',
  createdAt: '2026-09-21T00:00:00.000Z',
  lastUsedAt: '2026-09-21T00:05:00.000Z',
  expiresAt: '2026-09-28T00:00:00.000Z',
  current: true,
};
const userId = 'ckz8dc7m40000qwertyuiop12';
const missingUserId = 'ckz8dc7m40000qwertyuiop13';
const trustedAdmin = {
  id: 'ckz8dc7m40000asdfghjklz12',
  role: UserRole.platform_admin,
  mfaVerified: true,
  sessionId: 'session-1',
};
const safeSuspension = {
  userId,
  status: 'suspended',
  suspendedAt: new Date('2026-09-21T01:00:00.000Z'),
};
const safeReactivation = {
  userId,
  status: 'active',
};
const targetSessionId = '7d397356-f8f8-4f8e-9dce-5571bb1e24e0';
const safeRevocation = { userId, sessionId: targetSessionId, status: 'revoked' };
const safeBulkRevocation = { userId, revokedSessionCount: 2 };
const safeUsage = (plan: 'free' | 'pro' | 'premium') => ({
  userId,
  plan,
  period: 'monthly',
  resetAt: '2026-10-01T00:00:00.000Z',
  usage: {
    applications: { used: 3, limit: 10, remaining: 7, unlimited: false },
    aiRequests: { used: 5, limit: 5, remaining: 0, unlimited: false },
    resumeOptimizations: { used: 0, limit: 1, remaining: 1, unlimited: false },
    jobDiscoveries: { used: 2, limit: 3, remaining: 1, unlimited: false },
    resumes: { used: 1, limit: 1, remaining: 0, unlimited: false },
    storageBytes: { used: 1024, limit: 5242880, remaining: 5241856, unlimited: false },
  },
});

describe('AdminConsoleUsersController', () => {
  const users = {
    list: jest.fn().mockResolvedValue({
      users: [safeUser],
      limit: 20,
      nextCursor: null,
    }),
    detail: jest.fn().mockResolvedValue(safeUser),
    sessions: jest.fn().mockResolvedValue({
      sessions: [safeSession],
      limit: 20,
      nextCursor: null,
    }),
    usageLimits: jest.fn().mockResolvedValue(safeUsage('free')),
    suspend: jest.fn().mockResolvedValue(safeSuspension),
    reactivateUser: jest.fn().mockResolvedValue(safeReactivation),
  };
  const adminSessions = {
    revoke: jest.fn().mockResolvedValue(safeRevocation),
    revokeAll: jest.fn().mockResolvedValue(safeBulkRevocation),
  };
  const requestContext = { getRequestId: jest.fn(() => 'request_12345678') };

  async function createApp(options?: {
    enabled?: boolean;
    user?: {
      id?: string;
      role: UserRole;
      mfaVerified: boolean;
      sessionId?: string;
    };
    authenticated?: boolean;
  }): Promise<INestApplication> {
    const jwtGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        if (options?.authenticated === false) {
          throw new UnauthorizedException();
        }
        context.switchToHttp().getRequest().user = options?.user ?? trustedAdmin;
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminConsoleUsersController],
      providers: [
        { provide: AdminUsersService, useValue: users },
        { provide: AdminSessionsService, useValue: adminSessions },
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

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['non-platform-admin', { user: { ...trustedAdmin, role: UserRole.user } }, 403],
    ['MFA-incomplete platform admin', { user: { ...trustedAdmin, mfaVerified: false } }, 403],
    ['disabled feature flag', { enabled: false }, 403],
  ] as const)('denies session revocation for %s requests without consuming a proof', async (_name, options, status) => {
    const app = await createApp(options);
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/sessions/${targetSessionId}/revoke`)
      .set('X-Admin-Step-Up-Proof', 'c'.repeat(43));
    expect(response.status).toBe(status);
    expect(adminSessions.revoke).not.toHaveBeenCalled();
    await app.close();
  });

  it('revokes one session through the transaction-backed Admin session service', async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/sessions/${targetSessionId}/revoke`)
      .set('X-Admin-Step-Up-Proof', 'c'.repeat(43))
      .expect(200);

    expect(response.body).toEqual(safeRevocation);
    expect(adminSessions.revoke).toHaveBeenCalledWith({
      context: {
        actorUserId: trustedAdmin.id,
        sessionId: trustedAdmin.sessionId,
        role: UserRole.platform_admin,
        mfaVerified: true,
        correlationId: 'request_12345678',
      },
      targetUserId: userId,
      targetSessionId,
      stepUpProof: 'c'.repeat(43),
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /proof|token|hash|mfa|password|ipAddress|userAgent|cookie|authorization|cv|prompt|payment|secret/i,
    );
    await app.close();
  });

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['non-platform-admin', { user: { ...trustedAdmin, role: UserRole.user } }, 403],
    ['MFA-incomplete platform admin', { user: { ...trustedAdmin, mfaVerified: false } }, 403],
    ['disabled feature flag', { enabled: false }, 403],
  ] as const)('denies bulk session revocation for %s requests without consuming a proof', async (_name, options, status) => {
    const app = await createApp(options);
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/sessions/revoke-all`)
      .set('X-Admin-Step-Up-Proof', 'd'.repeat(43));
    expect(response.status).toBe(status);
    expect(adminSessions.revokeAll).not.toHaveBeenCalled();
    await app.close();
  });

  it('bulk-revokes through the authenticated user-bound transaction command without exposing sensitive data', async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/sessions/revoke-all`)
      .set('X-Admin-Step-Up-Proof', 'd'.repeat(43))
      .expect(200);

    expect(response.body).toEqual(safeBulkRevocation);
    expect(adminSessions.revokeAll).toHaveBeenCalledWith({
      context: {
        actorUserId: trustedAdmin.id,
        sessionId: trustedAdmin.sessionId,
        role: UserRole.platform_admin,
        mfaVerified: true,
        correlationId: 'request_12345678',
      },
      targetUserId: userId,
      stepUpProof: 'd'.repeat(43),
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /proof|token|hash|mfa|password|ipAddress|userAgent|cookie|authorization|cv|prompt|payment|secret/i,
    );
    await app.close();
  });

  it('rejects invalid user IDs and body fields before bulk-session delegation', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post('/admin/console/users/not-a-cuid/sessions/revoke-all')
      .set('X-Admin-Step-Up-Proof', 'd'.repeat(43))
      .expect(400);
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/sessions/revoke-all`)
      .set('X-Admin-Step-Up-Proof', 'd'.repeat(43))
      .send({ actorUserId: 'client-supplied', code: '123456' })
      .expect(400);
    expect(adminSessions.revokeAll).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'invalid-proof'],
    ['expired', 'd'.repeat(43)],
    ['mismatched action', 'e'.repeat(43)],
    ['mismatched target', 'f'.repeat(43)],
    ['replayed', 'g'.repeat(43)],
  ])('delegates %s bulk-session proof rejection without exposing proof data', async (_name, proof) => {
    adminSessions.revokeAll.mockRejectedValueOnce(
      new UnauthorizedException('Step-up proof is invalid'),
    );
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/sessions/revoke-all`)
      .set(proof ? 'X-Admin-Step-Up-Proof' : 'X-Unrelated-Header', proof ?? 'ignored')
      .expect(401);
    expect(adminSessions.revokeAll).toHaveBeenCalledWith(
      expect.objectContaining({ stepUpProof: proof ?? '' }),
    );
    if (proof) expect(JSON.stringify(response.body)).not.toContain(proof);
    await app.close();
  });

  it('returns the stable 409 category when an administrator targets their current session', async () => {
    const currentSessionId = '7d397356-f8f8-4f8e-9dce-5571bb1e24e0';
    adminSessions.revoke.mockRejectedValueOnce(
      new ConflictException('admin.session.current_revoke_forbidden'),
    );
    const app = await createApp({
      user: { ...trustedAdmin, sessionId: currentSessionId },
    });
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${trustedAdmin.id}/sessions/${currentSessionId}/revoke`)
      .set('X-Admin-Step-Up-Proof', 'c'.repeat(43))
      .expect(409);

    expect(response.body).toEqual(expect.objectContaining({
      message: 'admin.session.current_revoke_forbidden',
      statusCode: 409,
    }));
    expect(JSON.stringify(response.body)).not.toMatch(
      /proof|token|hash|mfa|ipAddress|userAgent|cookie|authorization|requestBody|secret/i,
    );
    await app.close();
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'invalid-proof'],
    ['expired', 'd'.repeat(43)],
    ['mismatched action', 'e'.repeat(43)],
    ['mismatched target', 'f'.repeat(43)],
    ['replayed', 'g'.repeat(43)],
  ])('delegates %s session proof rejection without exposing proof data', async (_name, proof) => {
    adminSessions.revoke.mockRejectedValueOnce(
      new UnauthorizedException('Step-up proof is invalid'),
    );
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/sessions/${targetSessionId}/revoke`)
      .set(proof ? 'X-Admin-Step-Up-Proof' : 'X-Unrelated-Header', proof ?? 'ignored')
      .expect(401);
    expect(adminSessions.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ stepUpProof: proof ?? '' }),
    );
    if (proof) expect(JSON.stringify(response.body)).not.toContain(proof);
    await app.close();
  });

  it('rejects invalid route identifiers and all body fields before session delegation', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post(`/admin/console/users/not-a-cuid/sessions/${targetSessionId}/revoke`)
      .set('X-Admin-Step-Up-Proof', 'c'.repeat(43))
      .expect(400);
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/sessions/not-a-uuid/revoke`)
      .set('X-Admin-Step-Up-Proof', 'c'.repeat(43))
      .expect(400);
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/sessions/${targetSessionId}/revoke`)
      .set('X-Admin-Step-Up-Proof', 'c'.repeat(43))
      .send({ code: '123456', stepUpProof: 'body-proof' })
      .expect(400);
    expect(adminSessions.revoke).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['non-platform-admin', { user: { ...trustedAdmin, role: UserRole.user } }, 403],
    ['MFA-incomplete platform admin', { user: { ...trustedAdmin, mfaVerified: false } }, 403],
    ['disabled feature flag', { enabled: false }, 403],
  ] as const)('denies suspension for %s requests without consuming a proof', async (_name, options, status) => {
    const app = await createApp(options);
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/suspend`)
      .set('X-Admin-Step-Up-Proof', 'a'.repeat(43))
      .send({ reason: 'Policy violation' });
    expect(response.status).toBe(status);
    expect(users.suspend).not.toHaveBeenCalled();
    await app.close();
  });

  it('suspends through the transaction-backed Admin service using only authenticated binding values', async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/suspend`)
      .set('X-Admin-Step-Up-Proof', 'a'.repeat(43))
      .send({ reason: '  Policy violation  ' })
      .expect(200);

    expect(response.body).toEqual({
      userId,
      status: 'suspended',
      suspendedAt: '2026-09-21T01:00:00.000Z',
    });
    expect(users.suspend).toHaveBeenCalledWith({
      context: {
        actorUserId: trustedAdmin.id,
        sessionId: trustedAdmin.sessionId,
        role: UserRole.platform_admin,
        mfaVerified: true,
        correlationId: 'request_12345678',
      },
      targetUserId: userId,
      reason: 'Policy violation',
      stepUpProof: 'a'.repeat(43),
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /proof|token|hash|mfa|password|ipAddress|userAgent|cookie|authorization|cv|prompt|payment|secret/i,
    );
    await app.close();
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'invalid-proof'],
    ['expired', 'b'.repeat(43)],
    ['mismatched', 'c'.repeat(43)],
    ['replayed', 'd'.repeat(43)],
  ])('delegates %s step-up proof rejection without exposing proof data', async (_name, proof) => {
    users.suspend.mockRejectedValueOnce(new UnauthorizedException('Step-up proof is invalid'));
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/suspend`)
      .set(proof ? 'X-Admin-Step-Up-Proof' : 'X-Unrelated-Header', proof ?? 'ignored')
      .send({ reason: 'Policy violation' })
      .expect(401);
    expect(users.suspend).toHaveBeenCalledWith(
      expect.objectContaining({ stepUpProof: proof ?? '' }),
    );
    if (proof) {
      expect(JSON.stringify(response.body)).not.toContain(proof);
    }
    await app.close();
  });

  it('delegates domain protections without auditing or mutating in the controller', async () => {
    users.suspend.mockRejectedValueOnce(
      new ForbiddenException('Administrators cannot suspend themselves'),
    );
    const app = await createApp();
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/suspend`)
      .set('X-Admin-Step-Up-Proof', 'a'.repeat(43))
      .send({ reason: 'Policy violation' })
      .expect(403);
    await app.close();

    users.suspend.mockRejectedValueOnce(
      new ForbiddenException('The last platform administrator cannot be suspended'),
    );
    const lastAdminApp = await createApp();
    await request(lastAdminApp.getHttpServer())
      .post(`/admin/console/users/${userId}/suspend`)
      .set('X-Admin-Step-Up-Proof', 'a'.repeat(43))
      .send({ reason: 'Policy violation' })
      .expect(403);
    await lastAdminApp.close();

    users.suspend.mockRejectedValueOnce(new ConflictException('User is already suspended'));
    const conflictApp = await createApp();
    await request(conflictApp.getHttpServer())
      .post(`/admin/console/users/${userId}/suspend`)
      .set('X-Admin-Step-Up-Proof', 'a'.repeat(43))
      .send({ reason: 'Policy violation' })
      .expect(409);
    await conflictApp.close();
  });

  it('rejects malformed route, body, raw TOTP, and unknown fields before delegating', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post('/admin/console/users/not-a-cuid/suspend')
      .set('X-Admin-Step-Up-Proof', 'a'.repeat(43))
      .send({ reason: 'Policy violation' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/suspend`)
      .set('X-Admin-Step-Up-Proof', 'a'.repeat(43))
      .send({ reason: 'invalid\nreason' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/suspend`)
      .set('X-Admin-Step-Up-Proof', 'a'.repeat(43))
      .send({ reason: 'Policy violation', code: '123456' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/suspend`)
      .set('X-Admin-Step-Up-Proof', 'a'.repeat(43))
      .send({
        reason: 'Policy violation',
        actorUserId: 'attacker',
        sessionId: 'attacker-session',
      })
      .expect(400);
    expect(users.suspend).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['non-platform-admin', { user: { ...trustedAdmin, role: UserRole.user } }, 403],
    ['MFA-incomplete platform admin', { user: { ...trustedAdmin, mfaVerified: false } }, 403],
    ['disabled feature flag', { enabled: false }, 403],
  ] as const)('denies reactivation for %s requests without consuming a proof', async (_name, options, status) => {
    const app = await createApp(options);
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/reactivate`)
      .set('X-Admin-Step-Up-Proof', 'b'.repeat(43))
      .send({});
    expect(response.status).toBe(status);
    expect(users.reactivateUser).not.toHaveBeenCalled();
    await app.close();
  });

  it('reactivates through the transaction-backed Admin service using only authenticated binding values', async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/reactivate`)
      .set('X-Admin-Step-Up-Proof', 'b'.repeat(43))
      .expect(200);

    expect(response.body).toEqual(safeReactivation);
    expect(users.reactivateUser).toHaveBeenCalledWith({
      context: {
        actorUserId: trustedAdmin.id,
        sessionId: trustedAdmin.sessionId,
        role: UserRole.platform_admin,
        mfaVerified: true,
        correlationId: 'request_12345678',
      },
      targetUserId: userId,
      stepUpProof: 'b'.repeat(43),
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /proof|token|hash|mfa|password|ipAddress|userAgent|cookie|authorization|cv|prompt|payment|secret|session/i,
    );
    await app.close();
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'invalid-proof'],
    ['expired', 'c'.repeat(43)],
    ['mismatched action', 'd'.repeat(43)],
    ['mismatched target', 'e'.repeat(43)],
    ['replayed', 'f'.repeat(43)],
  ])('delegates %s reactivation proof rejection without exposing proof data', async (_name, proof) => {
    users.reactivateUser.mockRejectedValueOnce(
      new UnauthorizedException('Step-up proof is invalid'),
    );
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/reactivate`)
      .set(proof ? 'X-Admin-Step-Up-Proof' : 'X-Unrelated-Header', proof ?? 'ignored')
      .send({})
      .expect(401);
    expect(users.reactivateUser).toHaveBeenCalledWith(
      expect.objectContaining({ stepUpProof: proof ?? '' }),
    );
    if (proof) expect(JSON.stringify(response.body)).not.toContain(proof);
    await app.close();
  });

  it('delegates self-action and already-active domain protections without controller mutations', async () => {
    users.reactivateUser.mockRejectedValueOnce(
      new ForbiddenException('Administrators cannot reactivate themselves'),
    );
    const app = await createApp();
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/reactivate`)
      .set('X-Admin-Step-Up-Proof', 'b'.repeat(43))
      .send({})
      .expect(403);
    await app.close();

    users.reactivateUser.mockRejectedValueOnce(
      new ConflictException('User is not suspended'),
    );
    const conflictApp = await createApp();
    await request(conflictApp.getHttpServer())
      .post(`/admin/console/users/${userId}/reactivate`)
      .set('X-Admin-Step-Up-Proof', 'b'.repeat(43))
      .send({})
      .expect(409);
    await conflictApp.close();
  });

  it('rejects malformed IDs, raw TOTP values, and all reactivation body fields before delegating', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .post('/admin/console/users/not-a-cuid/reactivate')
      .set('X-Admin-Step-Up-Proof', 'b'.repeat(43))
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/reactivate`)
      .set('X-Admin-Step-Up-Proof', 'b'.repeat(43))
      .send({ code: '123456' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/admin/console/users/${userId}/reactivate`)
      .set('X-Admin-Step-Up-Proof', 'b'.repeat(43))
      .send({ actorUserId: 'attacker', sessionId: 'attacker-session' })
      .expect(400);
    expect(users.reactivateUser).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 401 for an unauthenticated request', async () => {
    const app = await createApp({ authenticated: false });
    await request(app.getHttpServer()).get('/admin/console/users/user-1/sessions').expect(401);
    await app.close();
  });

  it('returns 403 for a non-platform-admin', async () => {
    const app = await createApp({
      user: { role: UserRole.user, mfaVerified: true },
    });
    await request(app.getHttpServer()).get('/admin/console/users/user-1/sessions').expect(403);
    await app.close();
  });

  it('returns 403 for an MFA-incomplete platform admin', async () => {
    const app = await createApp({
      user: { role: UserRole.platform_admin, mfaVerified: false },
    });
    await request(app.getHttpServer()).get('/admin/console/users/user-1/sessions').expect(403);
    await app.close();
  });

  it('returns 403 when the Admin Console feature flag is disabled', async () => {
    const app = await createApp({ enabled: false });
    await request(app.getHttpServer()).get('/admin/console/users/user-1/sessions').expect(403);
    await app.close();
  });

  it.each([
    ['unauthenticated', { authenticated: false }, 401],
    ['non-platform-admin', { user: { role: UserRole.user, mfaVerified: true } }, 403],
    ['MFA-incomplete platform admin', { user: { role: UserRole.platform_admin, mfaVerified: false } }, 403],
    ['disabled feature flag', { enabled: false }, 403],
  ] as const)('protects usage limits for %s requests', async (_name, options, status) => {
    const app = await createApp(options);
    await request(app.getHttpServer())
      .get(`/admin/console/users/${userId}/usage-limits`)
      .expect(status);
    await app.close();
  });

  it.each(['free', 'pro', 'premium'] as const)(
    'returns a sanitized %s plan usage response',
    async (plan) => {
      users.usageLimits.mockResolvedValueOnce(safeUsage(plan));
      const app = await createApp();
      const response = await request(app.getHttpServer())
        .get(`/admin/console/users/${userId}/usage-limits`)
        .expect(200);
      expect(response.body).toEqual(safeUsage(plan));
      expect(users.usageLimits).toHaveBeenCalledWith(userId);
      expect(JSON.stringify(response.body)).not.toMatch(
        /password|token|hash|mfa|ipAddress|userAgent|cookie|authorization|cv|prompt|document|payment|provider|secret/i,
      );
      await app.close();
    },
  );

  it('rejects invalid user IDs before calling the usage delegate', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .get('/admin/console/users/not-a-valid-id/usage-limits')
      .expect(400);
    expect(users.usageLimits).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    'User not found',
    'Subscription not found for user',
    'Usage limit not found for user',
  ])('returns the existing safe 404 response when Billing reports %s', async (message) => {
    users.usageLimits.mockRejectedValueOnce(new NotFoundException(message));
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .get(`/admin/console/users/${userId}/usage-limits`)
      .expect(404);
    expect(response.body).toEqual(expect.objectContaining({
      statusCode: 404,
      message,
    }));
    await app.close();
  });

  it('keeps the existing Admin rate limit on the usage endpoint controller', () => {
    expect(
      Reflect.getMetadata('THROTTLER:LIMITdefault', AdminConsoleUsersController),
    ).toBe(50);
    expect(
      Reflect.getMetadata('THROTTLER:TTLdefault', AdminConsoleUsersController),
    ).toBe(15 * 60_000);
  });

  it('returns a sanitized session page and passes the current session ID', async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .get(`/admin/console/users/${userId}/sessions?limit=20`)
      .expect(200);
    expect(response.body).toEqual({
      sessions: [safeSession],
      limit: 20,
      nextCursor: null,
    });
    expect(users.sessions).toHaveBeenCalledWith({
      targetUserId: userId,
      currentSessionId: 'session-1',
      limit: 20,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /token|hash|mfa|ipAddress|authorization|cookie|password|secret|cv|resume|prompt|payment/i,
    );
    await app.close();
  });

  it('rejects an excessive session page size and unknown fields', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .get(`/admin/console/users/${userId}/sessions?limit=101`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/admin/console/users/${userId}/sessions?includeTokens=true`)
      .expect(400);
    await app.close();
  });

  it('returns a safe 404 when the session target user is missing', async () => {
    users.sessions.mockRejectedValueOnce(new NotFoundException('User not found'));
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .get(`/admin/console/users/${missingUserId}/sessions`)
      .expect(404);
    expect(response.body).toEqual(expect.objectContaining({ message: 'User not found' }));
    expect(JSON.stringify(response.body)).not.toMatch(/token|secret|sessionHash/i);
    await app.close();
  });

  it('returns only the sanitized shared-contract shape for a valid admin', async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .get('/admin/console/users?limit=20&search=%20USER%40EXAMPLE.COM%20&role=user&status=active&plan=pro')
      .expect(200);
    expect(response.body).toEqual({ users: [safeUser], limit: 20, nextCursor: null });
    expect(users.list).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        search: 'user@example.com',
        role: 'user',
        status: 'active',
        plan: 'pro',
      }),
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|secret|token|session|mfa|resume|cv|prompt|payment|requestBody/i,
    );
    expect(response.body.users[0]).not.toHaveProperty('mfaEnabled');
    await app.close();
  });

  it('returns the existing safe 404 response for a missing user detail', async () => {
    users.detail.mockRejectedValueOnce(new NotFoundException('User not found'));
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .get(`/admin/console/users/${missingUserId}`)
      .expect(404);
    expect(response.body).toEqual(expect.objectContaining({
      statusCode: 404,
      message: 'User not found',
    }));
    expect(JSON.stringify(response.body)).not.toMatch(/password|secret|token/i);
    await app.close();
  });

  it('accepts valid CUID route IDs for detail and sessions', async () => {
    const app = await createApp();

    const detail = await request(app.getHttpServer())
      .get(`/admin/console/users/${userId}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/admin/console/users/${userId}/sessions`)
      .expect(200);

    expect(users.detail).toHaveBeenCalledWith(userId);
    expect(detail.body).not.toHaveProperty('mfaEnabled');
    expect(users.sessions).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: userId,
    }));
    await app.close();
  });

  it('rejects invalid CUID route IDs before detail or session services execute', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .get('/admin/console/users/not-a-valid-id')
      .expect(400);
    await request(app.getHttpServer())
      .get('/admin/console/users/not-a-valid-id/sessions')
      .expect(400);

    expect(users.detail).not.toHaveBeenCalled();
    expect(users.sessions).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects unknown query fields and a page size above the maximum', async () => {
    const app = await createApp();
    await request(app.getHttpServer())
      .get('/admin/console/users?unknown=true')
      .expect(400);
    await request(app.getHttpServer())
      .get('/admin/console/users?limit=101')
      .expect(400);
    expect(users.list).not.toHaveBeenCalled();
    await app.close();
  });

  it('documents list and detail responses with Swagger DTOs', async () => {
    const app = await createApp();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(document.paths['/admin/console/users']?.get?.responses?.['200']).toBeDefined();
    expect(document.paths['/admin/console/users/{userId}']?.get?.responses?.['200']).toBeDefined();
    expect(document.paths['/admin/console/users/{userId}/sessions']?.get?.responses?.['200']).toBeDefined();
    expect(document.paths['/admin/console/users/{userId}/usage-limits']?.get?.responses?.['200']).toBeDefined();
    expect(document.paths['/admin/console/users/{userId}/suspend']?.post?.responses?.['200']).toBeDefined();
    expect(document.paths['/admin/console/users/{userId}/reactivate']?.post?.responses?.['200']).toBeDefined();
    expect(document.paths['/admin/console/users/{userId}/reactivate']?.post?.requestBody).toBeDefined();
    expect(document.paths['/admin/console/users/{userId}/sessions/{sessionId}/revoke']?.post?.responses?.['200']).toBeDefined();
    await app.close();
  });
});

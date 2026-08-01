import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../application/auth.service';
import { PasswordService } from '../infrastructure/password.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { MfaService } from '../infrastructure/mfa.service';
import { NotificationService } from '../../notification/application/notification.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: any;
  let passwordServiceMock: any;
  let jwtServiceMock: any;
  let notificationServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      subscription: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          plan: 'pro',
          status: 'active',
        }),
      },
      usageLimit: {
        create: jest.fn(),
      },
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshTokenHistory: {
        create: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      extensionAuthHandoff: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      activityLog: {
        create: jest.fn().mockResolvedValue({ id: 'activity_1' }),
      },
      $transaction: jest.fn(
        (operation: ((client: any) => unknown) | Promise<unknown>[]) =>
          typeof operation === 'function'
            ? operation(prismaMock)
            : Promise.all(operation),
      ),
    };

    passwordServiceMock = {
      hash: jest.fn(),
      verify: jest.fn(),
    };

    jwtServiceMock = {
      sign: jest.fn(),
    };
    notificationServiceMock = {
      create: jest.fn().mockResolvedValue({ id: 'security_notice' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PasswordService, useValue: passwordServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
        {
          provide: MfaService,
          useValue: {
            createEnrollment: jest.fn().mockReturnValue({
              secret: 'BASE32SECRET',
              otpAuthUri: 'otpauth://totp/ApplyAI',
              encryptedSecret: 'encrypted-secret',
            }),
            verifyEncryptedSecret: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback: unknown) =>
              key === 'EXTENSION_ID' ? 'trusted-extension-id' : fallback,
            ),
            getOrThrow: jest.fn(() => 'test-jwt-secret-that-is-long-enough'),
          },
        },
        {
          provide: NotificationService,
          useValue: notificationServiceMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const email = 'test@example.com';
      const password = 'SecurePass123!@';
      const hashedPassword = 'hashed_password';
      const userId = 'user_123';

      prismaMock.user.findUnique.mockResolvedValue(null);
      passwordServiceMock.hash.mockResolvedValue(hashedPassword);
      prismaMock.user.create.mockResolvedValue({
        id: userId,
        email,
        role: 'user',
      });
      prismaMock.subscription.create.mockResolvedValue({});
      prismaMock.usageLimit.create.mockResolvedValue({});
      prismaMock.session.create.mockResolvedValue({ id: 'session_1' });
      jwtServiceMock.sign.mockReturnValue('access_token');

      const result = await service.register(email, password, undefined, true);

      expect(result).toHaveProperty('accessToken', 'access_token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id', userId);
      expect(result.user).toHaveProperty('email', email);
      expect(passwordServiceMock.hash).toHaveBeenCalledWith(password);
      expect(prismaMock.user.create).toHaveBeenCalled();
      expect(prismaMock.subscription.create).toHaveBeenCalled();
      expect(prismaMock.usageLimit.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const email = 'existing@example.com';
      const password = 'SecurePass123!@';

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing_user',
        email,
      });

      await expect(
        service.register(email, password, undefined, true),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
    });

    it('requires explicit data-processing consent', async () => {
      await expect(
        service.register('test@example.com', 'SecurePass123!@'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const email = 'test@example.com';
      const password = 'SecurePass123!@';
      const userId = 'user_123';
      const hashedPassword = 'hashed_password';

      prismaMock.user.findUnique.mockResolvedValue({
        id: userId,
        email,
        passwordHash: hashedPassword,
      });
      passwordServiceMock.verify.mockResolvedValue(true);
      prismaMock.session.create.mockResolvedValue({ id: 'session_1' });
      jwtServiceMock.sign.mockReturnValue('access_token');

      const result = await service.login(email, password);

      expect(result).toHaveProperty('accessToken', 'access_token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id', userId);
      expect(passwordServiceMock.verify).toHaveBeenCalledWith(
        hashedPassword,
        password,
      );
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      const email = 'test@example.com';
      const password = 'WrongPassword123!@';
      const hashedPassword = 'hashed_password';

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user_123',
        email,
        passwordHash: hashedPassword,
      });
      passwordServiceMock.verify.mockResolvedValue(false);

      await expect(service.login(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(passwordServiceMock.verify).toHaveBeenCalledWith(
        hashedPassword,
        password,
      );
    });

    it('should throw UnauthorizedException if user does not exist', async () => {
      const email = 'nonexistent@example.com';
      const password = 'SecurePass123!@';

      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.login(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
    });

    it('should throw UnauthorizedException if user has no password hash', async () => {
      const email = 'oauth@example.com';
      const password = 'SecurePass123!@';

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user_123',
        email,
        passwordHash: null,
      });

      await expect(service.login(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('requires MFA for privileged accounts', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'admin_1',
        email: 'admin@example.com',
        passwordHash: 'hashed',
        role: 'platform_admin',
        mfaEnabledAt: new Date(),
        mfaSecretEncrypted: 'encrypted-secret',
      });
      passwordServiceMock.verify.mockResolvedValue(true);

      await expect(
        service.login('admin@example.com', 'SecurePass123!@'),
      ).rejects.toThrow('A valid MFA code is required');
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });
  });

  describe('MFA enrollment', () => {
    it('stores an encrypted secret and verifies the first code', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          email: 'person@example.com',
          mfaEnabledAt: null,
        })
        .mockResolvedValueOnce({
          mfaSecretEncrypted: 'encrypted-secret',
        });
      prismaMock.user.update.mockResolvedValue({});
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.beginMfaSetup('user_123')).resolves.toEqual({
        secret: 'BASE32SECRET',
        otpAuthUri: 'otpauth://totp/ApplyAI',
      });
      await expect(
        service.confirmMfaSetup('user_123', 'session_1', '123456'),
      ).resolves.toEqual({
        enabled: true,
        enabledAt: expect.any(Date),
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: { mfaSecretEncrypted: 'encrypted-secret' },
      });
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session_1', userId: 'user_123' },
        data: { mfaVerifiedAt: expect.any(Date) },
      });
    });
  });

  describe('extension handoff', () => {
    it('creates a short-lived handoff without exposing session tokens', async () => {
      prismaMock.extensionAuthHandoff.deleteMany.mockResolvedValue({
        count: 0,
      });
      prismaMock.extensionAuthHandoff.create.mockResolvedValue({
        id: 'handoff_1',
      });

      const handoff = await service.createExtensionHandoff('user_123');

      expect(handoff).toEqual({
        code: expect.any(String),
        extensionId: 'trusted-extension-id',
        expiresAt: expect.any(Date),
      });
      expect(handoff.code.length).toBeGreaterThanOrEqual(32);
      expect(prismaMock.extensionAuthHandoff.create).toHaveBeenCalledWith({
        data: {
          userId: 'user_123',
          codeHash: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
    });

    it('consumes a handoff exactly once and creates an extension session', async () => {
      prismaMock.extensionAuthHandoff.findUnique.mockResolvedValue({
        id: 'handoff_1',
        userId: 'user_123',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: new Date(),
        user: {
          id: 'user_123',
          email: 'test@example.com',
          role: 'user',
          dataProcessingConsentAt: new Date(),
          privacyPolicyVersion: '2026-07-25',
        },
      });
      prismaMock.extensionAuthHandoff.updateMany.mockResolvedValue({
        count: 1,
      });
      prismaMock.session.create.mockResolvedValue({ id: 'session_1' });
      jwtServiceMock.sign.mockReturnValue('access_token');

      const result = await service.exchangeExtensionHandoff('a'.repeat(43), {
        userAgent: 'ApplyAI extension',
      });

      expect(result.accessToken).toBe('access_token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(prismaMock.extensionAuthHandoff.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'handoff_1',
            usedAt: null,
          }),
          data: { usedAt: expect.any(Date) },
        }),
      );
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user_123',
            userAgent: 'ApplyAI extension',
            clientType: 'extension',
          }),
        }),
      );
    });

    it('rejects a handoff that loses the single-use race', async () => {
      prismaMock.extensionAuthHandoff.findUnique.mockResolvedValue({
        id: 'handoff_1',
        userId: 'user_123',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: new Date(),
        user: { id: 'user_123' },
      });
      prismaMock.extensionAuthHandoff.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.exchangeExtensionHandoff('a'.repeat(43)),
      ).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('rotates an active refresh token exactly once', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session_1',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: new Date(),
        user: { id: 'user_123', email: 'test@example.com', role: 'user' },
      });
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.refreshTokenHistory.create.mockResolvedValue({
        id: 'history_1',
      });
      jwtServiceMock.sign.mockReturnValue('new_access_token');

      const result = await service.refreshToken('refresh_token');

      expect(result.accessToken).toBe('new_access_token');
      expect(result.refreshToken).not.toBe('refresh_token');
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'session_1',
            userId: 'user_123',
            token: expect.any(String),
          }),
        }),
      );
      expect(prismaMock.refreshTokenHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session_1',
          userId: 'user_123',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('revokes and reports a session that loses the rotation race', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session_1',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: new Date(),
        user: { id: 'user_123', email: 'test@example.com', role: 'user' },
      });
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });
      prismaMock.refreshTokenHistory.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refreshToken('replayed_token')).rejects.toThrow(
        'Session revoked because refresh token reuse was detected',
      );
      expect(jwtServiceMock.sign).not.toHaveBeenCalled();
      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session_1', userId: 'user_123' },
      });
      expect(prismaMock.refreshTokenHistory.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tokenHash: expect.any(String),
          sessionId: 'session_1',
          userId: 'user_123',
          detectedAt: null,
        }),
        data: { detectedAt: expect.any(Date) },
      });
      expect(prismaMock.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_123',
          type: 'auth_token_reuse',
          metadata: { method: 'superseded_refresh_token_replay' },
        }),
      });
      expect(notificationServiceMock.create).toHaveBeenCalledWith(
        'user_123',
        expect.any(String),
        expect.stringContaining('older sign-in token'),
        'in_app',
      );
    });

    it('detects a superseded token and revokes its active family', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);
      prismaMock.refreshTokenHistory.findUnique.mockResolvedValue({
        sessionId: 'session_1',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });
      prismaMock.refreshTokenHistory.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refreshToken('stolen_old_token')).rejects.toThrow(
        'Session revoked because refresh token reuse was detected',
      );

      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session_1', userId: 'user_123' },
      });
      expect(prismaMock.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_123',
          type: 'auth_token_reuse',
        }),
      });
    });

    it('detects a retained superseded token after its session was logged out', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);
      prismaMock.refreshTokenHistory.findUnique.mockResolvedValue({
        sessionId: 'deleted_session',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prismaMock.refreshTokenHistory.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshToken('old_after_logout')).rejects.toThrow(
        'Session revoked because refresh token reuse was detected',
      );

      expect(prismaMock.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_123',
          type: 'auth_token_reuse',
        }),
      });
      expect(notificationServiceMock.create).toHaveBeenCalledTimes(1);
    });

    it('does not repeat audit or notifications for an already detected token', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);
      prismaMock.refreshTokenHistory.findUnique.mockResolvedValue({
        sessionId: 'deleted_session',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prismaMock.refreshTokenHistory.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshToken('old_after_logout')).rejects.toThrow(
        'Session revoked because refresh token reuse was detected',
      );

      expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
      expect(notificationServiceMock.create).not.toHaveBeenCalled();
    });

    it('prunes expired history before evaluating a refresh token', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);
      prismaMock.refreshTokenHistory.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('expired_history')).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(prismaMock.refreshTokenHistory.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lte: expect.any(Date) } },
      });
    });

    it('rejects and deletes an idle session before rotating it', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session_1',
        userId: 'user_123',
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: new Date(Date.now() - 16 * 60_000),
        user: { id: 'user_123', email: 'test@example.com', role: 'user' },
      });

      await expect(service.refreshToken('idle_token')).rejects.toThrow(
        'Session expired',
      );
      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'session_1',
          token: expect.any(String),
        },
      });
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('logoutByRefreshToken', () => {
    it('revokes the session family even when the supplied token was just rotated', async () => {
      const sessionId = '123e4567-e89b-42d3-a456-426614174000';
      const proof = createHmac('sha256', 'test-jwt-secret-that-is-long-enough')
        .update(sessionId)
        .digest('base64url');

      await service.logoutByRefreshToken(`${sessionId}.${proof}.old-secret`);

      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ token: expect.any(String) }, { id: sessionId }],
        },
      });
    });
  });

  describe('session management', () => {
    it('lists active sessions and identifies the current one', async () => {
      prismaMock.session.findMany.mockResolvedValue([
        {
          id: 'current-session',
          userAgent: 'Browser',
          ipAddress: '127.0.0.1',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
        {
          id: 'other-session',
          userAgent: 'Extension',
          ipAddress: null,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      const sessions = await service.listSessions(
        'user_123',
        'current-session',
      );

      expect(sessions).toEqual([
        expect.objectContaining({ id: 'current-session', current: true }),
        expect.objectContaining({ id: 'other-session', current: false }),
      ]);
      expect(prismaMock.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user_123' }),
        }),
      );
    });

    it('revokes only a session owned by the user', async () => {
      prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        service.revokeSession('user_123', 'session-id'),
      ).resolves.toBeUndefined();
      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-id', userId: 'user_123' },
      });
    });

    it('does not reveal another user session', async () => {
      prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revokeSession('user_123', 'other-session'),
      ).rejects.toThrow('Session not found');
    });

    it('keeps the current session while revoking every other session', async () => {
      prismaMock.session.deleteMany.mockResolvedValue({ count: 2 });

      await expect(
        service.revokeOtherSessions('user_123', 'current-session'),
      ).resolves.toBe(2);
      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user_123', id: { not: 'current-session' } },
      });
    });
  });
});

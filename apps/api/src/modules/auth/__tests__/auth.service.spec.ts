import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../application/auth.service';
import { PasswordService } from '../infrastructure/password.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { MfaService } from '../infrastructure/mfa.service';
import { NotificationService } from '../../notification/application/notification.service';
import { Prisma, SubscriptionPlan, UserRole, UserStatus } from '@prisma/client';
import { BetaRegistrationGateService } from '../../beta/application/beta-registration-gate.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: any;
  let passwordServiceMock: any;
  let jwtServiceMock: any;
  let mfaServiceMock: any;
  let notificationServiceMock: any;
  let betaRegistrationGateMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      oAuthAccount: {
        findUnique: jest.fn(),
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
      verifyDummy: jest.fn().mockResolvedValue(undefined),
    };

    jwtServiceMock = {
      sign: jest.fn(),
    };
    mfaServiceMock = {
      createEnrollment: jest.fn().mockReturnValue({
        secret: 'BASE32SECRET',
        otpAuthUri: 'otpauth://totp/ApplyAI',
        encryptedSecret: 'encrypted-secret',
      }),
      verifyAndConsumeEncryptedSecret: jest.fn().mockResolvedValue(true),
    };
    notificationServiceMock = {
      create: jest.fn().mockResolvedValue({ id: 'security_notice' }),
    };
    betaRegistrationGateMock = {
      claimSlot: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PasswordService, useValue: passwordServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
        {
          provide: MfaService,
          useValue: mfaServiceMock,
        },
        {
          provide: BetaRegistrationGateService,
          useValue: betaRegistrationGateMock,
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

  describe('Admin Console user reads', () => {
    it('counts only explicitly suspended users in one Auth-owned aggregate query', async () => {
      prismaMock.user.count.mockResolvedValue(7);

      await expect(service.countSuspendedUsersForAdmin()).resolves.toBe(7);

      expect(prismaMock.user.count).toHaveBeenCalledTimes(1);
      expect(prismaMock.user.count).toHaveBeenCalledWith({
        where: { status: UserStatus.suspended },
      });
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(prismaMock.session.findMany).not.toHaveBeenCalled();
      expect(prismaMock.usageLimit.create).not.toHaveBeenCalled();
    });

    it('uses one bounded projected query with deterministic cursor ordering', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      const cursor = {
        createdAt: new Date('2026-09-21T00:00:00.000Z'),
        id: 'user-2',
      };

      await service.listAdminUsers({
        limit: 20,
        cursor,
        search: 'user@example.com',
        role: UserRole.user,
        status: UserStatus.active,
        plan: SubscriptionPlan.pro,
      });

      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
      const query = prismaMock.user.findMany.mock.calls[0][0];
      expect(query.take).toBe(21);
      expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(query.where).toEqual(expect.objectContaining({
        email: { contains: 'user@example.com', mode: 'insensitive' },
        role: UserRole.user,
        status: UserStatus.active,
        subscription: { is: { plan: SubscriptionPlan.pro } },
      }));
      expect(query.select).toEqual(expect.objectContaining({
        id: true,
        email: true,
        subscription: { select: { plan: true } },
      }));
      expect(query.select).not.toHaveProperty('passwordHash');
      expect(query.select).not.toHaveProperty('mfaSecretEncrypted');
      expect(query.select).not.toHaveProperty('sessions');
      expect(query.select).not.toHaveProperty('resumes');
      expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled();
    });

    it('reads one bounded sanitized session page without N+1 queries', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', sessions: [] });
      const cursor = {
        createdAt: new Date('2026-09-21T00:00:00.000Z'),
        id: 'session-2',
      };

      await service.listAdminUserSessions({
        userId: 'user-1',
        limit: 20,
        cursor,
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
      const query = prismaMock.user.findUnique.mock.calls[0][0];
      const sessions = query.select.sessions;
      expect(sessions.take).toBe(21);
      expect(sessions.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(sessions.select).toEqual({
        id: true,
        clientType: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      });
      expect(sessions.select).not.toHaveProperty('token');
      expect(sessions.select).not.toHaveProperty('ipAddress');
      expect(sessions.select).not.toHaveProperty('mfaVerifiedAt');
      expect(sessions.select).not.toHaveProperty('userAgent');
      expect(prismaMock.session.findMany).not.toHaveBeenCalled();
    });

    it('uses one projected global session query for active and expired filters', async () => {
      prismaMock.session.findMany.mockResolvedValue([]);

      await service.listAdminSessions({
        limit: 20,
        clientType: 'web' as never,
        status: 'active',
        createdFrom: new Date('2026-09-01T00:00:00.000Z'),
        lastUsedTo: new Date('2026-09-30T00:00:00.000Z'),
      });

      expect(prismaMock.session.findMany).toHaveBeenCalledTimes(1);
      const activeQuery = prismaMock.session.findMany.mock.calls[0][0];
      expect(activeQuery.take).toBe(21);
      expect(activeQuery.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(activeQuery.select).toEqual({
        userId: true,
        id: true,
        clientType: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      });
      expect(activeQuery.select).not.toHaveProperty('token');
      expect(activeQuery.select).not.toHaveProperty('ipAddress');
      expect(activeQuery.select).not.toHaveProperty('mfaVerifiedAt');
      expect(activeQuery.select).not.toHaveProperty('userAgent');
      expect(activeQuery.where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            expiresAt: { gt: expect.any(Date) },
            absoluteExpiresAt: { gt: expect.any(Date) },
            lastUsedAt: { gt: expect.any(Date) },
          }),
        ]),
      );

      prismaMock.session.findMany.mockClear();
      await service.listAdminSessions({ limit: 20, status: 'expired' });
      expect(prismaMock.session.findMany).toHaveBeenCalledTimes(1);
      const expiredQuery = prismaMock.session.findMany.mock.calls[0][0];
      expect(expiredQuery.where.AND).toEqual(
        expect.arrayContaining([
          {
            OR: [
              { expiresAt: { lte: expect.any(Date) } },
              { absoluteExpiresAt: { lte: expect.any(Date) } },
              { lastUsedAt: { lte: expect.any(Date) } },
            ],
          },
        ]),
      );
    });
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
      expect(betaRegistrationGateMock.claimSlot).toHaveBeenCalledWith(
        prismaMock,
      );
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

    it('converts a concurrent database uniqueness race into a conflict', async () => {
      const email = 'racing@example.com';
      prismaMock.user.findUnique.mockResolvedValue(null);
      passwordServiceMock.hash.mockResolvedValue('hashed_password');
      prismaMock.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.register(email, 'SecurePass123!@', undefined, true),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.subscription.create).not.toHaveBeenCalled();
    });

    it('requires explicit data-processing consent', async () => {
      await expect(
        service.register('test@example.com', 'SecurePass123!@'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('does not create a user when the beta gate has no remaining slots', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      passwordServiceMock.hash.mockResolvedValue('hashed_password');
      betaRegistrationGateMock.claimSlot.mockRejectedValue(
        new ForbiddenException('The ApplyAI beta is currently full'),
      );

      await expect(
        service.register('beta@example.com', 'SecurePass123!@', undefined, true),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(prismaMock.subscription.create).not.toHaveBeenCalled();
      expect(prismaMock.usageLimit.create).not.toHaveBeenCalled();
    });
  });

  describe('OAuth beta registration gate', () => {
    it('claims a slot for a newly created OAuth user inside the registration transaction', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'oauth_user_1',
        email: 'oauth@example.com',
        role: 'user',
        dataProcessingConsentAt: null,
        privacyPolicyVersion: null,
        mfaEnabledAt: null,
      });
      prismaMock.session.create.mockResolvedValue({ id: 'session_1' });
      jwtServiceMock.sign.mockReturnValue('access_token');

      await service.validateOAuthUser({
        email: 'oauth@example.com',
        provider: 'google' as never,
        providerId: 'google_1',
      });

      expect(betaRegistrationGateMock.claimSlot).toHaveBeenCalledWith(
        prismaMock,
      );
      expect(prismaMock.user.create).toHaveBeenCalled();
    });

    it('does not claim another slot when an existing OAuth user signs in', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue({
        user: {
          id: 'oauth_user_1',
          email: 'oauth@example.com',
          role: 'user',
          dataProcessingConsentAt: null,
          privacyPolicyVersion: null,
          mfaEnabledAt: null,
        },
      });
      prismaMock.session.create.mockResolvedValue({ id: 'session_1' });
      jwtServiceMock.sign.mockReturnValue('access_token');

      await service.validateOAuthUser({
        email: 'oauth@example.com',
        provider: 'google' as never,
        providerId: 'google_1',
      });

      expect(betaRegistrationGateMock.claimSlot).not.toHaveBeenCalled();
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('does not create an OAuth session for a suspended user', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue({
        user: {
          id: 'suspended-user',
          email: 'suspended@example.com',
          role: UserRole.user,
          status: UserStatus.suspended,
        },
      });

      await expect(
        service.validateOAuthUser({
          email: 'suspended@example.com',
          provider: 'google' as never,
          providerId: 'google-suspended',
        }),
      ).rejects.toThrow('Unable to sign in');

      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('does not create a password session for a suspended user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'suspended-user',
        email: 'suspended@example.com',
        passwordHash: 'hashed-password',
        status: UserStatus.suspended,
        lockedUntil: null,
      });

      await expect(
        service.login('suspended@example.com', 'SecurePass123!@'),
      ).rejects.toThrow('Invalid credentials');

      expect(passwordServiceMock.verifyDummy).toHaveBeenCalled();
      expect(passwordServiceMock.verify).not.toHaveBeenCalled();
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

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
      expect(passwordServiceMock.verifyDummy).not.toHaveBeenCalled();
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
      expect(passwordServiceMock.verifyDummy).not.toHaveBeenCalled();
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
      expect(passwordServiceMock.verifyDummy).toHaveBeenCalledWith(password);
      expect(passwordServiceMock.verify).not.toHaveBeenCalled();
      expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: null,
            type: 'auth_login_failed',
            metadata: { method: 'unknown_account' },
          }),
        }),
      );
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
      expect(passwordServiceMock.verifyDummy).toHaveBeenCalledWith(password);
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
      expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'auth_login_failed',
            metadata: { method: 'invalid_mfa' },
          }),
        }),
      );
    });

    it('consumes a privileged account MFA code before creating a session', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'admin_1',
        email: 'admin@example.com',
        passwordHash: 'hashed',
        role: 'platform_admin',
        mfaEnabledAt: new Date(),
        mfaSecretEncrypted: 'encrypted-secret',
      });
      passwordServiceMock.verify.mockResolvedValue(true);
      prismaMock.session.create.mockResolvedValue({ id: 'session_1' });
      jwtServiceMock.sign.mockReturnValue('access_token');

      await expect(
        service.login('admin@example.com', 'SecurePass123!@', undefined, '123456'),
      ).resolves.toHaveProperty('accessToken', 'access_token');

      expect(mfaServiceMock.verifyAndConsumeEncryptedSecret).toHaveBeenCalledWith(
        'admin_1',
        'encrypted-secret',
        '123456',
      );
    });

    it('locks an account after repeated invalid passwords and audits the lockout', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          id: 'user_123',
          email: 'person@example.com',
          passwordHash: 'hashed',
          failedLoginAttempts: 4,
          lockedUntil: null,
        })
        .mockResolvedValueOnce({ failedLoginAttempts: 5 });
      passwordServiceMock.verify.mockResolvedValue(false);

      await expect(service.login('person@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { failedLoginAttempts: { increment: 1 } },
        }),
      );
      expect(prismaMock.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'auth_account_locked',
            metadata: { method: 'failed_login_threshold' },
          }),
        }),
      );
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
      expect(mfaServiceMock.verifyAndConsumeEncryptedSecret).toHaveBeenCalledWith(
        'user_123',
        'encrypted-secret',
        '123456',
      );
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

    it('revokes one owned admin-targeted session in the supplied transaction while preserving replay history', async () => {
      const transaction = {
        user: { findUnique: jest.fn() },
        session: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-id',
            userId: 'user_123',
          }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        refreshTokenHistory: { deleteMany: jest.fn(), create: jest.fn() },
      };

      await expect(
        service.revokeAdminSessionInTransaction(
          transaction,
          'user_123',
          'session-id',
        ),
      ).resolves.toEqual({
        value: { userId: 'user_123', sessionId: 'session-id', status: 'revoked' },
        before: { enabled: true },
        after: { enabled: false },
      });
      expect(transaction.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-id' },
        select: { id: true, userId: true },
      });
      expect(transaction.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-id', userId: 'user_123' },
      });
      expect(transaction.refreshTokenHistory.deleteMany).not.toHaveBeenCalled();
      expect(transaction.refreshTokenHistory.create).not.toHaveBeenCalled();
    });

    it('keeps existing safe not-found semantics for missing, wrong-owner, or already-revoked sessions', async () => {
      const transaction = {
        user: { findUnique: jest.fn() },
        session: {
          findUnique: jest.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'session-id', userId: 'other-user' })
            .mockResolvedValueOnce({ id: 'session-id', userId: 'user_123' }),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      await expect(
        service.revokeAdminSessionInTransaction(transaction, 'user_123', 'session-id'),
      ).rejects.toThrow('Session not found');
      await expect(
        service.revokeAdminSessionInTransaction(transaction, 'user_123', 'session-id'),
      ).rejects.toThrow('Session not found');
      await expect(
        service.revokeAdminSessionInTransaction(transaction, 'user_123', 'session-id'),
      ).rejects.toThrow('Session not found');
      expect(transaction.session.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('revokes all target sessions in the supplied transaction while preserving an optional current session and replay history', async () => {
      const transaction = {
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'user_123' }) },
        session: {
          findUnique: jest.fn(),
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        refreshTokenHistory: { deleteMany: jest.fn(), create: jest.fn() },
      };

      await expect(
        service.revokeAdminOtherSessionsInTransaction(
          transaction,
          'user_123',
          'current-session',
        ),
      ).resolves.toEqual({
        value: { userId: 'user_123', revokedSessionCount: 2 },
        before: { enabled: true },
        after: { enabled: false },
      });
      expect(transaction.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        select: { id: true },
      });
      expect(transaction.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user_123', id: { not: 'current-session' } },
      });
      expect(transaction.refreshTokenHistory.deleteMany).not.toHaveBeenCalled();
      expect(transaction.refreshTokenHistory.create).not.toHaveBeenCalled();
    });

    it('keeps safe missing-user behavior and permits a deterministic zero bulk result', async () => {
      const transaction = {
        user: { findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'user_123' }) },
        session: {
          findUnique: jest.fn(),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      await expect(
        service.revokeAdminOtherSessionsInTransaction(transaction, 'missing-user'),
      ).rejects.toThrow('User not found');
      await expect(
        service.revokeAdminOtherSessionsInTransaction(transaction, 'user_123'),
      ).resolves.toMatchObject({ value: { userId: 'user_123', revokedSessionCount: 0 } });
      expect(transaction.session.deleteMany).toHaveBeenLastCalledWith({
        where: { userId: 'user_123' },
      });
    });
  });

  describe('transaction-aware administrative user commands', () => {
    it('uses the supplied transaction and revokes sessions with their active refresh tokens', async () => {
      const transaction = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'target-user',
            role: UserRole.user,
            status: UserStatus.active,
          }),
          count: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        session: {
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };

      const mutation = await service.suspendUserInTransaction(
        transaction,
        'admin-user',
        'target-user',
        'policy violation',
      );

      expect(transaction.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'target-user', status: UserStatus.active } }),
      );
      expect(transaction.user.updateMany.mock.calls[0][0].data).not.toHaveProperty(
        'lockedUntil',
      );
      expect(transaction.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'target-user' },
      });
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
      expect(mutation).toEqual(expect.objectContaining({
        value: expect.objectContaining({
          userId: 'target-user',
          status: UserStatus.suspended,
        }),
        before: { status: UserStatus.active },
        after: expect.objectContaining({ status: UserStatus.suspended }),
      }));
    });

    it('preserves self-action and last-platform-admin protections', async () => {
      const transaction = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'target-admin',
            role: UserRole.platform_admin,
            status: UserStatus.active,
          }),
          count: jest.fn().mockResolvedValue(0),
          updateMany: jest.fn(),
        },
        session: { deleteMany: jest.fn() },
      };

      await expect(
        service.suspendUserInTransaction(
          transaction,
          'same-admin',
          'same-admin',
          'reason',
        ),
      ).rejects.toThrow('Administrators cannot suspend themselves');
      await expect(
        service.suspendUserInTransaction(
          transaction,
          'actor-admin',
          'target-admin',
          'reason',
        ),
      ).rejects.toThrow('last platform administrator');
      expect(transaction.user.updateMany).not.toHaveBeenCalled();
    });

    it('reactivates only a suspended user without recreating sessions or tokens', async () => {
      const transaction = {
        user: {
          findUnique: jest.fn(),
          count: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        session: {
          deleteMany: jest.fn(),
          create: jest.fn(),
        },
        refreshTokenHistory: {
          create: jest.fn(),
        },
      };

      const mutation = await service.reactivateUserInTransaction(
        transaction,
        'admin-user',
        'target-user',
      );

      expect(transaction.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'target-user', status: UserStatus.suspended },
        data: {
          status: UserStatus.active,
          suspendedAt: null,
          suspendedByUserId: null,
          suspensionReason: null,
        },
      });
      expect(transaction.user.updateMany.mock.calls[0][0].data).not.toHaveProperty(
        'lockedUntil',
      );
      expect(transaction.session.create).not.toHaveBeenCalled();
      expect(transaction.session.deleteMany).not.toHaveBeenCalled();
      expect(transaction.refreshTokenHistory.create).not.toHaveBeenCalled();
      expect(mutation).toEqual({
        value: { userId: 'target-user', status: UserStatus.active },
        before: { status: UserStatus.suspended },
        after: { status: UserStatus.active, suspendedAt: null },
      });
    });

    it('rejects already-active and self-reactivation attempts', async () => {
      const transaction = {
        user: {
          findUnique: jest.fn(),
          count: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        session: { deleteMany: jest.fn() },
      };

      await expect(
        service.reactivateUserInTransaction(
          transaction,
          'admin-user',
          'active-user',
        ),
      ).rejects.toThrow('User is not suspended');
      await expect(
        service.reactivateUserInTransaction(
          transaction,
          'same-admin',
          'same-admin',
        ),
      ).rejects.toThrow('Administrators cannot reactivate themselves');
    });
  });
});

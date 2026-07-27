import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Logger,
  NotFoundException,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { PasswordService } from '../infrastructure/password.service';
import * as crypto from 'crypto';
import {
  ActivityType,
  OAuthProvider,
  Prisma,
  SessionClientType,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { MfaService } from '../infrastructure/mfa.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mfaService: MfaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async register(
    email: string,
    password: string,
    fullName?: string,
    acceptedDataProcessing?: boolean,
    sessionMetadata?: SessionMetadata,
  ) {
    if (acceptedDataProcessing !== true) {
      throw new BadRequestException('Data-processing consent is required');
    }
    email = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await this.passwordService.hash(password);

    const resetAt = this.getNextResetDate();

    let user;
    try {
      user = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            email,
            passwordHash,
            dataProcessingConsentAt: this.clock.now(),
            privacyPolicyVersion: '2026-07-25',
            ...(fullName?.trim()
              ? { profile: { create: { fullName: fullName.trim() } } }
              : {}),
          },
        });
        await transaction.subscription.create({
          data: {
            userId: created.id,
            plan: SubscriptionPlan.free,
            status: SubscriptionStatus.active,
          },
        });
        await transaction.usageLimit.create({
          data: { userId: created.id, period: 'monthly', resetAt },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User with this email already exists');
      }
      throw error;
    }

    const tokens = await this.generateTokens(user.id, sessionMetadata);
    await this.writeAuthActivity(
      user.id,
      ActivityType.auth_login,
      'registration_login',
      sessionMetadata,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        dataProcessingConsentAt: user.dataProcessingConsentAt,
        privacyPolicyVersion: user.privacyPolicyVersion,
        mfaEnabled: Boolean(user.mfaEnabledAt),
      },
    };
  }

  async login(
    email: string,
    password: string,
    sessionMetadata?: SessionMetadata,
    mfaCode?: string,
  ) {
    email = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await this.passwordService.verify(user.passwordHash, password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const privileged =
      user.role === UserRole.org_admin ||
      user.role === UserRole.platform_admin;
    if (
      privileged &&
      (!user.mfaEnabledAt ||
        !user.mfaSecretEncrypted ||
        !mfaCode ||
        !this.mfaService.verifyEncryptedSecret(
          user.mfaSecretEncrypted,
          mfaCode,
        ))
    ) {
      throw new UnauthorizedException(
        'A valid MFA code is required for administrator accounts',
      );
    }

    const tokens = await this.generateTokens(
      user.id,
      sessionMetadata,
      privileged,
    );
    await this.writeAuthActivity(
      user.id,
      ActivityType.auth_login,
      'password_login',
      sessionMetadata,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        dataProcessingConsentAt: user.dataProcessingConsentAt,
        privacyPolicyVersion: user.privacyPolicyVersion,
        mfaEnabled: Boolean(user.mfaEnabledAt),
      },
    };
  }

  async createExtensionHandoff(userId: string) {
    const extensionId = this.configService.get<string>('EXTENSION_ID');
    if (!extensionId) {
      throw new BadRequestException('Extension authentication is not configured');
    }

    const code = crypto.randomBytes(32).toString('base64url');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + 2 * 60_000);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.extensionAuthHandoff.deleteMany({
        where: {
          userId,
          OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }],
        },
      });
      await transaction.extensionAuthHandoff.create({
        data: { userId, codeHash, expiresAt },
      });
    });

    return { code, extensionId, expiresAt };
  }

  async beginMfaSetup(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaEnabledAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.mfaEnabledAt) {
      throw new BadRequestException('MFA is already enabled');
    }

    const enrollment = this.mfaService.createEnrollment(user.email);
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEncrypted: enrollment.encryptedSecret },
    });
    return {
      secret: enrollment.secret,
      otpAuthUri: enrollment.otpAuthUri,
    };
  }

  async confirmMfaSetup(userId: string, sessionId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecretEncrypted: true },
    });
    if (!user?.mfaSecretEncrypted) {
      throw new BadRequestException('Start MFA setup first');
    }
    if (!this.mfaService.verifyEncryptedSecret(user.mfaSecretEncrypted, code)) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    const enabledAt = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabledAt: enabledAt },
      }),
      this.prisma.session.updateMany({
        where: { id: sessionId, userId },
        data: { mfaVerifiedAt: enabledAt },
      }),
    ]);
    return { enabled: true, enabledAt };
  }

  async exchangeExtensionHandoff(
    code: string,
    sessionMetadata?: SessionMetadata,
  ) {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const now = this.clock.now();

    const handoff = await this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.extensionAuthHandoff.findUnique({
        where: { codeHash },
        include: { user: true },
      });
      if (!candidate || candidate.usedAt || candidate.expiresAt <= now) {
        throw new UnauthorizedException('Invalid or expired extension handoff');
      }
      const subscription = await transaction.subscription.findUnique({
        where: { userId: candidate.userId },
        select: { plan: true, status: true },
      });
      if (!this.isPaidExtensionSubscription(subscription)) {
        throw new ForbiddenException('A Pro plan is required to use the extension');
      }
      const consumed = await transaction.extensionAuthHandoff.updateMany({
        where: {
          id: candidate.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('Extension handoff was already used');
      }
      return candidate;
    });

    const tokens = await this.generateTokens(
      handoff.userId,
      sessionMetadata,
      false,
      SessionClientType.extension,
    );
    await this.writeAuthActivity(
      handoff.userId,
      ActivityType.auth_login,
      'extension_handoff',
      sessionMetadata,
    );
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: handoff.user.id,
        email: handoff.user.email,
        role: handoff.user.role,
        dataProcessingConsentAt: handoff.user.dataProcessingConsentAt,
        privacyPolicyVersion: handoff.user.privacyPolicyVersion,
        mfaEnabled: Boolean(handoff.user.mfaEnabledAt),
      },
    };
  }

  async validateOAuthUser(profile: {
    email: string;
    provider: OAuthProvider;
    providerId: string;
    accessToken?: string;
    refreshToken?: string;
  }) {
    profile.email = profile.email.trim().toLowerCase();
    const linkedAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerId: {
          provider: profile.provider,
          providerId: profile.providerId,
        },
      },
      include: { user: true },
    });
    let user = linkedAccount?.user;

    if (!user) {
      const sameEmailUser = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (sameEmailUser) {
        throw new ConflictException(
          'An account with this email already exists. Sign in with its existing method.',
        );
      }

      const resetAt = this.getNextResetDate();

      user = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            email: profile.email,
            isEmailVerified: true,
            oauthAccounts: {
              create: {
                provider: profile.provider,
                providerId: profile.providerId,
              },
            },
          },
        });
        await transaction.subscription.create({
          data: {
            userId: created.id,
            plan: SubscriptionPlan.free,
            status: SubscriptionStatus.active,
          },
        });
        await transaction.usageLimit.create({
          data: { userId: created.id, period: 'monthly', resetAt },
        });
        return created;
      });
    }

    const tokens = await this.generateTokens(user.id);
    await this.writeAuthActivity(
      user.id,
      ActivityType.auth_login,
      `oauth_${profile.provider}`,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        dataProcessingConsentAt: user.dataProcessingConsentAt,
        privacyPolicyVersion: user.privacyPolicyVersion,
        mfaEnabled: Boolean(user.mfaEnabledAt),
      },
    };
  }

  async refreshToken(token: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const session = await this.prisma.session.findUnique({
      where: { token: tokenHash },
      include: { user: { include: { subscription: true } } },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (
      session.clientType === SessionClientType.extension &&
      !this.isPaidExtensionSubscription(session.user.subscription)
    ) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException('A Pro plan is required to use the extension');
    }

    const now = this.clock.now();
    const idleCutoff = new Date(
      now.getTime() - this.getSessionIdleTimeoutMs(),
    );
    if (
      session.expiresAt <= now ||
      session.absoluteExpiresAt <= now ||
      session.lastUsedAt <= idleCutoff
    ) {
      await this.prisma.session.deleteMany({
        where: { id: session.id, token: tokenHash },
      });
      throw new UnauthorizedException('Session expired');
    }

    const tokens = await this.rotateTokens(
      session.id,
      session.userId,
      tokenHash,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        dataProcessingConsentAt: session.user.dataProcessingConsentAt,
        privacyPolicyVersion: session.user.privacyPolicyVersion,
        mfaEnabled: Boolean(session.user.mfaEnabledAt),
      },
    };
  }

  async logout(userId: string, sessionId: string) {
    if (!sessionId) {
      throw new UnauthorizedException('Session is missing');
    }
    await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    await this.writeAuthActivity(userId, ActivityType.auth_logout, 'session_logout');

    return { message: 'Logged out successfully' };
  }

  async logoutByRefreshToken(token: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionId = this.sessionIdFromRefreshToken(token);
    const where = sessionId
      ? { OR: [{ token: tokenHash }, { id: sessionId }] }
      : { token: tokenHash };
    const session = await this.prisma.session.findFirst({
      where,
      select: { userId: true },
    });
    await this.prisma.session.deleteMany({
      where,
    });
    if (session) {
      await this.writeAuthActivity(
        session.userId,
        ActivityType.auth_logout,
        'refresh_token_logout',
      );
    }
  }

  async listSessions(userId: string, currentSessionId: string) {
    const now = this.clock.now();
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        lastUsedAt: {
          gt: new Date(now.getTime() - this.getSessionIdleTimeoutMs()),
        },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        absoluteExpiresAt: true,
        clientType: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    if (revoked.count !== 1) {
      throw new NotFoundException('Session not found');
    }
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const revoked = await this.prisma.session.deleteMany({
      where: { userId, id: { not: currentSessionId } },
    });
    return revoked.count;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      dataProcessingConsentAt: user.dataProcessingConsentAt,
      privacyPolicyVersion: user.privacyPolicyVersion,
      mfaEnabled: Boolean(user.mfaEnabledAt),
      createdAt: user.createdAt,
      profile: user.profile,
    };
  }

  private async generateTokens(
    userId: string,
    metadata?: SessionMetadata,
    mfaVerified = false,
    clientType: SessionClientType = SessionClientType.web,
  ) {
    const sessionId = crypto.randomUUID();
    const rawRefreshToken = this.createRefreshToken(sessionId);
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const now = this.clock.now();
    const expiresAt = new Date(now);
    expiresAt.setDate(
      expiresAt.getDate() + Number(this.configService.get('REFRESH_TOKEN_TTL_DAYS', 7)),
    );
    const absoluteExpiresAt = new Date(
      now.getTime() +
        Number(
          this.configService.get('SESSION_ABSOLUTE_TIMEOUT_HOURS', 8),
        ) *
          60 *
          60_000,
    );

    const session = await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        token: refreshTokenHash,
        expiresAt,
        absoluteExpiresAt,
        mfaVerifiedAt: mfaVerified ? now : null,
        clientType,
        userAgent: metadata?.userAgent?.slice(0, 500),
        ipAddress: metadata?.ipAddress?.slice(0, 64),
      },
    });

    const accessToken = this.jwtService.sign({ sub: userId, sid: session.id });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  private async writeAuthActivity(
    userId: string,
    type: ActivityType,
    method: string,
    metadata?: SessionMetadata,
  ): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId,
          type,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          metadata: { method },
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not persist ${type} audit event for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async rotateTokens(
    sessionId: string,
    userId: string,
    previousTokenHash: string,
  ) {
    const rawRefreshToken = this.createRefreshToken(sessionId);
    const token = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const now = this.clock.now();
    const expiresAt = new Date(now);
    expiresAt.setDate(
      expiresAt.getDate() + Number(this.configService.get('REFRESH_TOKEN_TTL_DAYS', 7)),
    );

    const rotated = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        token: previousTokenHash,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        lastUsedAt: {
          gt: new Date(now.getTime() - this.getSessionIdleTimeoutMs()),
        },
      },
      data: { token, expiresAt, lastUsedAt: now },
    });
    if (rotated.count !== 1) {
      throw new UnauthorizedException('Refresh token has already been used');
    }

    return {
      accessToken: this.jwtService.sign({ sub: userId, sid: sessionId }),
      refreshToken: rawRefreshToken,
    };
  }

  private getNextResetDate(): Date {
    const now = this.clock.now();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }

  private isPaidExtensionSubscription(
    subscription:
      | { plan: SubscriptionPlan; status: SubscriptionStatus }
      | null
      | undefined,
  ): boolean {
    if (!subscription) return false;
    const active =
      subscription.status === SubscriptionStatus.active ||
      subscription.status === SubscriptionStatus.trialing ||
      subscription.status === SubscriptionStatus.past_due;
    return (
      active &&
      (subscription.plan === SubscriptionPlan.pro ||
        subscription.plan === SubscriptionPlan.premium)
    );
  }

  private getSessionIdleTimeoutMs(): number {
    return (
      Number(this.configService.get('SESSION_IDLE_TIMEOUT_MINUTES', 15)) *
      60_000
    );
  }

  private createRefreshToken(sessionId: string): string {
    const proof = crypto
      .createHmac('sha256', this.configService.getOrThrow<string>('JWT_SECRET'))
      .update(sessionId)
      .digest('base64url');
    return `${sessionId}.${proof}.${crypto.randomBytes(40).toString('base64url')}`;
  }

  private sessionIdFromRefreshToken(token: string): string | undefined {
    const [sessionId, suppliedProof, secret, ...extra] = token.split('.');
    if (
      !sessionId ||
      !suppliedProof ||
      !secret ||
      extra.length > 0 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        sessionId,
      )
    ) {
      return undefined;
    }
    const expectedProof = crypto
      .createHmac('sha256', this.configService.getOrThrow<string>('JWT_SECRET'))
      .update(sessionId)
      .digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(suppliedProof, 'base64url');
    } catch {
      return undefined;
    }
    return provided.length === expectedProof.length &&
      crypto.timingSafeEqual(provided, expectedProof)
      ? sessionId
      : undefined;
  }
}

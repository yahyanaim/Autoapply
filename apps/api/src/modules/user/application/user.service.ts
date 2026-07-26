import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UpdateProfileDto } from '../interface/dto/update-profile.dto';
import { StorageToken } from '../../resume/application/resume.service';
import { StoragePort } from '../../../shared/ports/storage.port';
import { StripeAdapter } from '../../billing/infrastructure/stripe/stripe.adapter';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(StorageToken) private readonly storage: StoragePort,
    private readonly stripe: StripeAdapter,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        dataProcessingConsentAt: true,
        privacyPolicyVersion: true,
        mfaEnabledAt: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, data: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.profile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  async recordDataProcessingConsent(userId: string) {
    const updated = await this.prisma.user.updateMany({
      where: { id: userId },
      data: {
        dataProcessingConsentAt: this.clock.now(),
        privacyPolicyVersion: '2026-07-25',
      },
    });
    if (updated.count !== 1) throw new NotFoundException('User not found');
    return {
      accepted: true,
      privacyPolicyVersion: '2026-07-25',
    };
  }

  async exportData(userId: string) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        dataProcessingConsentAt: true,
        privacyPolicyVersion: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
        resumes: { include: { versions: true, skills: true } },
        applications: {
          include: {
            job: { include: { company: true, skills: true } },
            resumeVersion: true,
            coverLetter: true,
          },
        },
        coverLetters: true,
        subscription: { include: { payments: true } },
        aiRequests: true,
        notifications: true,
        activityLogs: true,
        usageLimit: true,
        oauthAccounts: {
          select: {
            provider: true,
            providerId: true,
            createdAt: true,
          },
        },
        sessions: {
          select: {
            id: true,
            userAgent: true,
            ipAddress: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
            absoluteExpiresAt: true,
            mfaVerifiedAt: true,
          },
        },
      },
    });
    if (!account) throw new NotFoundException('User not found');
    return {
      formatVersion: '1.0',
      exportedAt: this.clock.now().toISOString(),
      account,
    };
  }

  async deleteAccount(userId: string): Promise<void> {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscription: { select: { stripeSubscriptionId: true } },
        resumes: { select: { originalFileUrl: true } },
      },
    });
    if (!account) throw new NotFoundException('User not found');

    if (account.subscription?.stripeSubscriptionId) {
      await this.stripe.cancelSubscription(account.subscription.stripeSubscriptionId);
    }
    for (const resume of account.resumes) {
      await this.storage.deleteFile(resume.originalFileUrl);
    }

    const deleted = await this.prisma.user.deleteMany({ where: { id: userId } });
    if (deleted.count !== 1) throw new NotFoundException('User not found');
  }

  async listUsers(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          role: true,
          isEmailVerified: true,
          dataProcessingConsentAt: true,
          privacyPolicyVersion: true,
          mfaEnabledAt: true,
          createdAt: true,
          updatedAt: true,
          profile: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    return { users, total, page, limit };
  }
}

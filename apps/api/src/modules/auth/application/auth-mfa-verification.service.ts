import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { MfaService } from '../infrastructure/mfa.service';

/** Safe Auth-module boundary: callers receive only a boolean, never MFA material. */
@Injectable()
export class AuthMfaVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfa: MfaService,
  ) {}

  async verifyFreshTotp(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecretEncrypted: true, mfaEnabledAt: true },
    });
    if (!user?.mfaEnabledAt || !user.mfaSecretEncrypted) return false;
    return this.mfa.verifyAndConsumeEncryptedSecret(
      userId,
      user.mfaSecretEncrypted,
      code,
    );
  }
}

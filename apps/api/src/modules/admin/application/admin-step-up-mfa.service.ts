import { BadRequestException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';
import { AuthMfaVerificationService } from '../../auth/application/auth-mfa-verification.service';
import { nextStepUpMfaFailure } from './admin-step-up-mfa-lockout';

export interface StepUpBinding { actorUserId: string; sessionId: string; action: string; targetType: string; targetId: string; }
export interface StepUpProofTransaction {
  adminStepUpMfaProof: Pick<
    Prisma.TransactionClient['adminStepUpMfaProof'],
    'updateMany'
  >;
}

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class AdminStepUpMfaService {
  constructor(private readonly prisma: PrismaService, private readonly authMfa: AuthMfaVerificationService, @Optional() private readonly clock: SystemClock = new SystemClock()) {}

  async issue(binding: StepUpBinding, code: string): Promise<{ proof: string; expiresAt: Date }> {
    const where = {
      actorUserId_sessionId_action_targetType_targetId: binding,
    };
    const beforeVerification = await this.prisma.adminStepUpMfaAttempt.findUnique({
      where,
    });
    if (
      beforeVerification?.lockedUntil &&
      beforeVerification.lockedUntil > this.clock.now()
    ) {
      throw new UnauthorizedException('Step-up verification failed');
    }

    const valid = await this.authMfa.verifyFreshTotp(
      binding.actorUserId,
      code,
    );
    const proof = valid ? randomBytes(32).toString('base64url') : null;

    const result = await this.runSerializable(async (tx) => {
      // Serializable isolation makes this read-modify-write operation conflict
      // with concurrent attempts for the same composite binding. P2034 retries
      // re-run only this database work, never the MFA verification above.

      const now = this.clock.now();
      const attempt = await tx.adminStepUpMfaAttempt.findUnique({
        where,
      });
      const current = attempt
        ? {
            failedAttempts: attempt.failedAttempts,
            windowStartedAt: attempt.windowStartedAt,
            lockedUntil: attempt.lockedUntil,
          }
        : null;

      if (!valid) {
        // This request was admitted before MFA verification while the binding
        // was unlocked. A lock observed here may have been created by another
        // admitted request, so record this failure from the latest durable
        // count while retaining the state machine's window and five-attempt cap.
        const admittedState = current
          ? { ...current, lockedUntil: null }
          : null;
        const failure = nextStepUpMfaFailure(admittedState, now);
        if (!failure.allowed) return { status: 'rejected' as const };
        await tx.adminStepUpMfaAttempt.upsert({
          where,
          create: { ...binding, ...failure.next },
          update: failure.next,
        });
        return { status: 'rejected' as const };
      }

      if (current?.lockedUntil && current.lockedUntil > now) {
        return { status: 'rejected' as const };
      }

      const expiresAt = new Date(now.getTime() + 5 * 60_000);
      await tx.adminStepUpMfaAttempt.deleteMany({ where: binding });
      await tx.adminStepUpMfaProof.create({
        data: { ...binding, proofHash: this.hash(proof!), expiresAt },
      });
      return { status: 'issued' as const, proof: proof!, expiresAt };
    });
    if (result.status === 'rejected') {
      throw new UnauthorizedException('Step-up verification failed');
    }
    return { proof: result.proof, expiresAt: result.expiresAt };
  }

  async consume(binding: StepUpBinding, proof: string, transaction: StepUpProofTransaction = this.prisma): Promise<void> {
    if (!/^[A-Za-z0-9_-]{40,}$/.test(proof)) throw new BadRequestException('Invalid step-up proof');
    const used = await transaction.adminStepUpMfaProof.updateMany({
      where: { ...binding, proofHash: this.hash(proof), expiresAt: { gt: this.clock.now() }, usedAt: null },
      data: { usedAt: this.clock.now() },
    });
    if (used.count !== 1) throw new UnauthorizedException('Step-up proof is invalid');
  }

  private hash(proof: string): string { return createHash('sha256').update(proof).digest('hex'); }

  private async runSerializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!retryable || attempt === SERIALIZABLE_TRANSACTION_ATTEMPTS) {
          throw error;
        }
      }
    }
    throw new Error('Serializable transaction retry loop exhausted');
  }
}

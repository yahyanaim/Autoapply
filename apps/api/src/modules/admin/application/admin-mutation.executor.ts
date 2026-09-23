import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  AdminAuditService,
  AdminAuditSnapshot,
  isSafeAdminCorrelationId,
  isSafeAdminIdentifier,
} from './admin-audit.service';
import {
  AdminStepUpMfaService,
  StepUpBinding,
} from './admin-step-up-mfa.service';

export interface AdminMutationContext {
  actorUserId: string;
  sessionId: string;
  role: UserRole;
  mfaVerified: boolean;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminDomainMutation<T> {
  value: T;
  before?: AdminAuditSnapshot;
  after?: AdminAuditSnapshot;
}

export interface ExecuteAdminMutation<T> {
  context: AdminMutationContext;
  proof: string;
  action: string;
  targetType: string;
  targetId: string;
  command: (
    transaction: Prisma.TransactionClient,
  ) => Promise<AdminDomainMutation<T>>;
}

@Injectable()
export class AdminMutationExecutor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stepUpMfa: AdminStepUpMfaService,
    private readonly audit: AdminAuditService,
  ) {}

  async execute<T>(input: ExecuteAdminMutation<T>): Promise<T> {
    this.validate(input);
    const binding: StepUpBinding = {
      actorUserId: input.context.actorUserId,
      sessionId: input.context.sessionId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
    };

    return this.prisma.$transaction(async (transaction) => {
      await this.stepUpMfa.consume(binding, input.proof, transaction);
      const mutation = await input.command(transaction);
      await this.audit.write(transaction, {
        actorUserId: input.context.actorUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        correlationId: input.context.correlationId,
        ipAddress: input.context.ipAddress,
        userAgent: input.context.userAgent,
        before: mutation.before,
        after: mutation.after,
      });
      return mutation.value;
    });
  }

  private validate<T>(input: ExecuteAdminMutation<T>): void {
    if (
      input.context.role !== UserRole.platform_admin ||
      input.context.mfaVerified !== true
    ) {
      throw new ForbiddenException('Platform administrator MFA is required');
    }
    const identifiers = [
      input.context.actorUserId,
      input.context.sessionId,
      input.action,
      input.targetType,
      input.targetId,
    ];
    if (
      identifiers.some((value) => !isSafeAdminIdentifier(value)) ||
      !isSafeAdminCorrelationId(input.context.correlationId)
    ) {
      throw new ForbiddenException('Invalid administrative mutation context');
    }
  }
}

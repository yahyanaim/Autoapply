import { Injectable } from '@nestjs/common';
import { Prisma, QuotaGrantCategory, QuotaGrantReason } from '@prisma/client';
import {
  BillingQuotaService,
  QuotaGrantPersistenceConflict,
  QuotaGrantReplay,
} from '../../billing/application/billing-quota.service';
import { AdminMutationContext, AdminMutationExecutor } from './admin-mutation.executor';

export interface GrantAdminQuotaInput {
  context: AdminMutationContext;
  targetUserId: string;
  category: QuotaGrantCategory;
  amount: number;
  expiresAt: Date;
  reason: QuotaGrantReason;
  idempotencyKey: string;
  stepUpProof: string;
}

@Injectable()
export class AdminQuotaService {
  constructor(
    private readonly mutations: AdminMutationExecutor,
    private readonly quota: BillingQuotaService,
  ) {}

  async grant(input: GrantAdminQuotaInput) {
    const command = {
      targetUserId: input.targetUserId,
      actorUserId: input.context.actorUserId,
      category: input.category,
      amount: input.amount,
      expiresAt: input.expiresAt,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      now: new Date(),
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.mutations.execute({
          context: input.context,
          proof: input.stepUpProof,
          action: 'admin.quota.grant',
          targetType: 'user',
          targetId: input.targetUserId,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          command: (transaction) => this.quota.grantInTransaction(transaction, command),
        });
      } catch (error) {
        if (error instanceof QuotaGrantReplay || error instanceof QuotaGrantPersistenceConflict) {
          return this.quota.resolveIdempotentResult(command);
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2034' && attempt < 3) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('Quota grant transaction retry loop exhausted');
  }
}

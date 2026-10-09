import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BillingVerifiedWebhookRetryService,
  VerifiedWebhookRetryPersistenceConflict,
  VerifiedWebhookRetryReplay,
} from '../../billing/application/billing-verified-webhook-retry.service';
import { AdminMutationContext, AdminMutationExecutor } from './admin-mutation.executor';

@Injectable()
export class AdminWebhookRetryService {
  constructor(
    private readonly mutations: AdminMutationExecutor,
    private readonly billing: BillingVerifiedWebhookRetryService,
  ) {}

  async request(input: {
    context: AdminMutationContext;
    deliveryId: string;
    idempotencyKey: string;
    stepUpProof: string;
  }) {
    const command = {
      deliveryId: input.deliveryId,
      actorUserId: input.context.actorUserId,
      idempotencyKey: input.idempotencyKey,
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.mutations.execute({
          context: input.context,
          proof: input.stepUpProof,
          action: 'admin.webhook.retry',
          targetType: 'webhook_delivery',
          targetId: input.deliveryId,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          command: (transaction) => this.billing.requestInTransaction(transaction, {
            ...command, now: new Date(),
          }),
        });
      } catch (error) {
        if (error instanceof VerifiedWebhookRetryReplay ||
          error instanceof VerifiedWebhookRetryPersistenceConflict ||
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return this.billing.resolveIdempotentResult(command);
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' && attempt < 3) continue;
        throw error;
      }
    }
    throw new Error('Webhook retry transaction retry loop exhausted');
  }
}

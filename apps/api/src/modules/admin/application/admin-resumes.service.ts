import { Injectable } from '@nestjs/common';
import { ResumeRequeueReason } from '@prisma/client';
import {
  ResumeRequeueCommandService,
  ResumeRequeuePersistenceConflict,
  ResumeRequeueReplay,
} from '../../resume/application/resume-requeue-command.service';
import {
  AdminMutationContext,
  AdminMutationExecutor,
} from './admin-mutation.executor';

export interface RequeueAdminResumeInput {
  context: AdminMutationContext;
  resumeId: string;
  reason: ResumeRequeueReason;
  idempotencyKey: string;
  stepUpProof: string;
}

@Injectable()
export class AdminResumesService {
  constructor(
    private readonly mutations: AdminMutationExecutor,
    private readonly resumes: ResumeRequeueCommandService,
  ) {}

  async requeue(input: RequeueAdminResumeInput) {
    const commandInput = {
      resumeId: input.resumeId,
      actorUserId: input.context.actorUserId,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    };
    try {
      return await this.mutations.execute({
        context: input.context,
        proof: input.stepUpProof,
        action: 'admin.resume.requeue',
        targetType: 'resume',
        targetId: input.resumeId,
        command: (transaction) =>
          this.resumes.requestRequeueInTransaction(transaction, commandInput),
      });
    } catch (error) {
      if (
        error instanceof ResumeRequeueReplay ||
        error instanceof ResumeRequeuePersistenceConflict
      ) {
        return this.resumes.resolveIdempotentResult(commandInput);
      }
      throw error;
    }
  }
}

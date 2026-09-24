import { Injectable } from '@nestjs/common';
import { JobDeactivationReason } from '@prisma/client';
import { JobService } from '../../job/application/job.service';
import {
  AdminMutationContext,
  AdminMutationExecutor,
} from './admin-mutation.executor';

export interface DeactivateAdminJobInput {
  context: AdminMutationContext;
  jobId: string;
  reason: JobDeactivationReason;
  stepUpProof: string;
}

@Injectable()
export class AdminJobsService {
  constructor(
    private readonly mutations: AdminMutationExecutor,
    private readonly jobs: JobService,
  ) {}

  deactivate(input: DeactivateAdminJobInput) {
    return this.mutations.execute({
      context: input.context,
      proof: input.stepUpProof,
      action: 'admin.job.deactivate',
      targetType: 'job',
      targetId: input.jobId,
      command: (transaction) =>
        this.jobs.deactivateInTransaction(
          transaction,
          input.context.actorUserId,
          input.jobId,
          input.reason,
        ),
    });
  }
}

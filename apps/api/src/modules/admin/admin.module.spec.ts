import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuthMfaVerificationService } from '../auth/application/auth-mfa-verification.service';
import { AuthService } from '../auth/application/auth.service';
import { AdminModule } from './admin.module';
import { AdminAuditService } from './application/admin-audit.service';
import { AdminMutationExecutor } from './application/admin-mutation.executor';
import { AdminStepUpMfaService } from './application/admin-step-up-mfa.service';
import { AdminUsersService } from './application/admin-users.service';
import { AdminSessionsService } from './application/admin-sessions.service';
import { BillingUsageReadService } from '../billing/application/billing-usage-read.service';
import { BillingModule } from '../billing/billing.module';
import { AdminConsoleActivityLogsController } from './interface/admin-console-activity-logs.controller';
import { AdminConsoleStepUpController } from './interface/admin-console-step-up.controller';
import { AdminOverviewService } from './application/admin-overview.service';
import { AdminConsoleOverviewController } from './interface/admin-console-overview.controller';
import { AdminJobsService } from './application/admin-jobs.service';
import { JobService } from '../job/application/job.service';
import { AdminResumesService } from './application/admin-resumes.service';
import { ResumeRequeueCommandService } from '../resume/application/resume-requeue-command.service';
import { AdminMetricsService } from './application/admin-metrics.service';
import { AdminConsoleMetricsController } from './interface/admin-console-metrics.controller';
import { BillingMetricsReadService } from '../billing/application/billing-metrics-read.service';
import { AiMetricsReadService } from '../ai/application/ai-metrics-read.service';
import { AIModule } from '../ai/ai.module';

describe('AdminModule', () => {
  it('registers and compiles the mutation foundation without circular dependencies', async () => {
    const providers = Reflect.getMetadata('providers', AdminModule) as unknown[];
    const imports = Reflect.getMetadata('imports', AdminModule) as unknown[];
    const controllers = Reflect.getMetadata('controllers', AdminModule) as unknown[];
    expect(imports).toEqual(expect.arrayContaining([BillingModule, AIModule]));
    expect(controllers).toEqual(
      expect.arrayContaining([
        AdminConsoleActivityLogsController,
        AdminConsoleStepUpController,
        AdminConsoleOverviewController,
        AdminConsoleMetricsController,
      ]),
    );
    expect(providers).toEqual(
      expect.arrayContaining([
        AdminAuditService,
        AdminMutationExecutor,
        AdminStepUpMfaService,
        AdminUsersService,
        AdminSessionsService,
        AdminOverviewService,
        AdminJobsService,
        AdminResumesService,
        AdminMetricsService,
      ]),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        AdminMutationExecutor,
        AdminStepUpMfaService,
        AdminUsersService,
        AdminSessionsService,
        AdminOverviewService,
        AdminJobsService,
        AdminResumesService,
        AdminMetricsService,
        { provide: PrismaService, useValue: {} },
        { provide: AuthMfaVerificationService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: BillingUsageReadService, useValue: {} },
        { provide: JobService, useValue: {} },
        { provide: ResumeRequeueCommandService, useValue: {} },
        { provide: BillingMetricsReadService, useValue: {} },
        { provide: AiMetricsReadService, useValue: {} },
      ],
    })
      .compile();

    expect(moduleRef.get(AdminMutationExecutor)).toBeInstanceOf(
      AdminMutationExecutor,
    );
    expect(moduleRef.get(AdminUsersService)).toBeInstanceOf(AdminUsersService);
    await moduleRef.close();
  });
});

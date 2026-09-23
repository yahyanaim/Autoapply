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

describe('AdminModule', () => {
  it('registers and compiles the mutation foundation without circular dependencies', async () => {
    const providers = Reflect.getMetadata('providers', AdminModule) as unknown[];
    const imports = Reflect.getMetadata('imports', AdminModule) as unknown[];
    const controllers = Reflect.getMetadata('controllers', AdminModule) as unknown[];
    expect(imports).toEqual(expect.arrayContaining([BillingModule]));
    expect(controllers).toEqual(
      expect.arrayContaining([
        AdminConsoleActivityLogsController,
        AdminConsoleStepUpController,
        AdminConsoleOverviewController,
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
        { provide: PrismaService, useValue: {} },
        { provide: AuthMfaVerificationService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: BillingUsageReadService, useValue: {} },
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

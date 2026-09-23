import { Module } from '@nestjs/common';
import { AdminService } from './application/admin.service';
import { AdminController } from './interface/admin.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { JobModule } from '../job/job.module';
import { AuthModule } from '../auth/auth.module';
import { AdminStepUpMfaService } from './application/admin-step-up-mfa.service';
import { AdminAuditService } from './application/admin-audit.service';
import { AdminMutationExecutor } from './application/admin-mutation.executor';
import { AdminUsersService } from './application/admin-users.service';
import { AdminConsoleUsersController } from './interface/admin-console-users.controller';
import { AdminConsoleEnabledGuard } from './interface/guards/admin-console-enabled.guard';
import { AdminSessionsService } from './application/admin-sessions.service';
import { AdminConsoleSessionsController } from './interface/admin-console-sessions.controller';
import { BillingModule } from '../billing/billing.module';
import { AdminConsoleActivityLogsController } from './interface/admin-console-activity-logs.controller';
import { AdminConsoleStepUpController } from './interface/admin-console-step-up.controller';
import { AdminOverviewService } from './application/admin-overview.service';
import { AdminConsoleOverviewController } from './interface/admin-console-overview.controller';

@Module({
  imports: [PrismaModule, JobModule, AuthModule, BillingModule],
  providers: [
    AdminService,
    AdminStepUpMfaService,
    AdminAuditService,
    AdminMutationExecutor,
    AdminUsersService,
    AdminOverviewService,
    AdminConsoleEnabledGuard,
    AdminSessionsService,
  ],
  controllers: [
    AdminController,
    AdminConsoleUsersController,
    AdminConsoleSessionsController,
    AdminConsoleActivityLogsController,
    AdminConsoleStepUpController,
    AdminConsoleOverviewController,
  ],
  exports: [AdminService, AdminMutationExecutor, AdminUsersService],
})
export class AdminModule {}

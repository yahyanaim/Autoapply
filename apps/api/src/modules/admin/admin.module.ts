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
import { ResumeModule } from '../resume/resume.module';
import { BetaModule } from '../beta/beta.module';
import { NotificationModule } from '../notification/notification.module';
import { ApplicationModule } from '../application-tracker/application-tracker.module';
import { AdminOperationsService } from './application/admin-operations.service';
import { AdminConsoleOperationsController } from './interface/admin-console-operations.controller';
import { AdminJobsService } from './application/admin-jobs.service';
import { AdminResumesService } from './application/admin-resumes.service';
import { AIModule } from '../ai/ai.module';
import { AdminMetricsService } from './application/admin-metrics.service';
import { AdminConsoleMetricsController } from './interface/admin-console-metrics.controller';
import { AdminQuotaService } from './application/admin-quota.service';
import { AdminBillingCompletenessService } from './application/admin-billing-completeness.service';
import { AdminConsoleBillingCompletenessController } from './interface/admin-console-billing-completeness.controller';
import { AdminVerifiedWebhooksService } from './application/admin-verified-webhooks.service';
import { AdminConsoleVerifiedWebhooksController } from './interface/admin-console-verified-webhooks.controller';
import { AdminWebhookRetryService } from './application/admin-webhook-retry.service';

@Module({
  imports: [
    PrismaModule,
    JobModule,
    AuthModule,
    BillingModule,
    ResumeModule,
    BetaModule,
    NotificationModule,
    ApplicationModule,
    AIModule,
  ],
  providers: [
    AdminService,
    AdminStepUpMfaService,
    AdminAuditService,
    AdminMutationExecutor,
    AdminUsersService,
    AdminOverviewService,
    AdminConsoleEnabledGuard,
    AdminSessionsService,
    AdminOperationsService,
    AdminJobsService,
    AdminResumesService,
    AdminMetricsService,
    AdminQuotaService,
    AdminBillingCompletenessService,
    AdminVerifiedWebhooksService,
    AdminWebhookRetryService,
  ],
  controllers: [
    AdminController,
    AdminConsoleUsersController,
    AdminConsoleSessionsController,
    AdminConsoleActivityLogsController,
    AdminConsoleStepUpController,
    AdminConsoleOverviewController,
    AdminConsoleOperationsController,
    AdminConsoleMetricsController,
    AdminConsoleBillingCompletenessController,
    AdminConsoleVerifiedWebhooksController,
  ],
  exports: [AdminService, AdminMutationExecutor, AdminUsersService],
})
export class AdminModule {}

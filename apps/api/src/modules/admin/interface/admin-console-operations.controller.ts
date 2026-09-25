import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminOperationsService } from '../application/admin-operations.service';
import { AdminJobsService } from '../application/admin-jobs.service';
import { AdminResumesService } from '../application/admin-resumes.service';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { RequestContextService } from '../../../shared/observability/request-context.service';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { requireIdempotencyKey } from '../../../shared/idempotency/idempotency-key';
import {
  AdminConsoleApplicationsQueryDto,
  AdminConsoleApplicationsResponseDto,
  AdminConsoleBetaGateResponseDto,
  AdminConsoleIdParamDto,
  AdminConsoleJobDetailResponseDto,
  AdminConsoleDeactivateJobDto,
  AdminConsoleDeactivateJobResponseDto,
  AdminConsoleJobsQueryDto,
  AdminConsoleJobsResponseDto,
  AdminConsoleNotificationsQueryDto,
  AdminConsoleNotificationsResponseDto,
  AdminConsoleResumeFailureResponseDto,
  AdminConsoleResumeIdParamDto,
  AdminConsoleResumeFailuresQueryDto,
  AdminConsoleResumeFailuresResponseDto,
  AdminConsoleRequeueResumeDto,
  AdminConsoleRequeueResumeResponseDto,
} from './dto/admin-console-operations.dto';

@ApiTags('admin-console-operations')
@ApiBearerAuth()
@Controller('admin/console')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
@ApiResponse({ status: 400, description: 'Invalid Admin Console operations request' })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Admin Console access denied' })
export class AdminConsoleOperationsController {
  constructor(
    private readonly operations: AdminOperationsService,
    private readonly adminJobs: AdminJobsService,
    private readonly adminResumes: AdminResumesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get('jobs')
  @ApiOperation({ summary: 'List sanitized operational jobs' })
  @ApiResponse({ status: 200, type: AdminConsoleJobsResponseDto })
  listJobs(@Query() query: AdminConsoleJobsQueryDto) {
    return this.operations.listJobs(query);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get one sanitized operational job' })
  @ApiParam({ name: 'id', description: 'Prisma CUID job identifier' })
  @ApiResponse({ status: 200, type: AdminConsoleJobDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found' })
  getJob(@Param() params: AdminConsoleIdParamDto) {
    return this.operations.getJob(params.id);
  }

  @Post('jobs/:id/deactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate one job with a bound step-up proof' })
  @ApiParam({ name: 'id', description: 'Prisma CUID job identifier' })
  @ApiHeader({
    name: 'X-Admin-Step-Up-Proof',
    required: true,
    description: 'Single-use proof bound to this actor, session, action, and job',
  })
  @ApiBody({ type: AdminConsoleDeactivateJobDto })
  @ApiResponse({ status: 200, type: AdminConsoleDeactivateJobResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid deactivation request or proof' })
  @ApiResponse({ status: 401, description: 'Step-up proof is invalid' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async deactivateJob(
    @Param() params: AdminConsoleIdParamDto,
    @Headers('x-admin-step-up-proof') stepUpProof: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('sessionId') sessionId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('mfaVerified') mfaVerified: boolean,
    @Body() input: AdminConsoleDeactivateJobDto,
  ) {
    const mutation = await this.adminJobs.deactivate({
      context: {
        actorUserId,
        sessionId,
        role,
        mfaVerified,
        correlationId: this.requestContext.getRequestId(),
      },
      jobId: params.id,
      reason: input.reason,
      stepUpProof: stepUpProof ?? '',
    });
    return {
      jobId: mutation.jobId,
      status: mutation.status,
      deactivatedAt: mutation.deactivatedAt.toISOString(),
      reason: mutation.reason,
    };
  }

  @Get('resume-failures')
  @ApiOperation({ summary: 'List sanitized failed resume-processing records' })
  @ApiResponse({ status: 200, type: AdminConsoleResumeFailuresResponseDto })
  listResumeFailures(@Query() query: AdminConsoleResumeFailuresQueryDto) {
    return this.operations.listResumeFailures(query);
  }

  @Get('resume-failures/:id')
  @ApiOperation({ summary: 'Get one sanitized resume-processing failure' })
  @ApiParam({ name: 'id', description: 'Prisma CUID resume identifier' })
  @ApiResponse({ status: 200, type: AdminConsoleResumeFailureResponseDto })
  @ApiResponse({ status: 404, description: 'Resume processing failure not found' })
  getResumeFailure(@Param() params: AdminConsoleIdParamDto) {
    return this.operations.getResumeFailure(params.id);
  }

  @Post('resume-failures/:resumeId/requeue')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request one idempotent requeue for an eligible resume failure',
  })
  @ApiParam({ name: 'resumeId', description: 'Prisma CUID resume identifier' })
  @ApiHeader({
    name: 'X-Admin-Step-Up-Proof',
    required: true,
    description: 'Single-use proof bound to this actor, session, action, and resume',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Stable key for this logical requeue request',
  })
  @ApiBody({ type: AdminConsoleRequeueResumeDto })
  @ApiResponse({ status: 200, type: AdminConsoleRequeueResumeResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid requeue request or proof' })
  @ApiResponse({ status: 401, description: 'Step-up proof is invalid' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  @ApiResponse({ status: 404, description: 'Resume processing failure not found' })
  @ApiResponse({ status: 409, description: 'Resume failure is not requeueable' })
  async requeueResume(
    @Param() params: AdminConsoleResumeIdParamDto,
    @Headers('x-admin-step-up-proof') stepUpProof: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('sessionId') sessionId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('mfaVerified') mfaVerified: boolean,
    @Body() input: AdminConsoleRequeueResumeDto,
  ) {
    const mutation = await this.adminResumes.requeue({
      context: {
        actorUserId,
        sessionId,
        role,
        mfaVerified,
        correlationId: this.requestContext.getRequestId(),
      },
      resumeId: params.resumeId,
      reason: input.reason,
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
      stepUpProof: stepUpProof ?? '',
    });
    return {
      ...mutation,
      requestedAt: mutation.requestedAt.toISOString(),
    };
  }

  @Get('beta')
  @ApiOperation({ summary: 'Get the durable Beta registration gate summary' })
  @ApiResponse({ status: 200, type: AdminConsoleBetaGateResponseDto })
  getBetaGate() {
    return this.operations.getBetaGate();
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get bounded notification delivery operations data' })
  @ApiResponse({ status: 200, type: AdminConsoleNotificationsResponseDto })
  getNotifications(@Query() query: AdminConsoleNotificationsQueryDto) {
    return this.operations.getNotifications(query);
  }

  @Get('applications')
  @ApiOperation({ summary: 'Get non-attributable aggregate application volumes' })
  @ApiResponse({ status: 200, type: AdminConsoleApplicationsResponseDto })
  getApplications(@Query() query: AdminConsoleApplicationsQueryDto) {
    return this.operations.getApplications(query);
  }
}

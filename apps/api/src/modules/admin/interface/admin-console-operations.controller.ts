import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminOperationsService } from '../application/admin-operations.service';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import {
  AdminConsoleApplicationsQueryDto,
  AdminConsoleApplicationsResponseDto,
  AdminConsoleBetaGateResponseDto,
  AdminConsoleIdParamDto,
  AdminConsoleJobDetailResponseDto,
  AdminConsoleJobsQueryDto,
  AdminConsoleJobsResponseDto,
  AdminConsoleNotificationsQueryDto,
  AdminConsoleNotificationsResponseDto,
  AdminConsoleResumeFailureResponseDto,
  AdminConsoleResumeFailuresQueryDto,
  AdminConsoleResumeFailuresResponseDto,
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
  constructor(private readonly operations: AdminOperationsService) {}

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

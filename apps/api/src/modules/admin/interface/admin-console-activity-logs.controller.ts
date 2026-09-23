import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AdminAuditService } from '../application/admin-audit.service';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { RequestContextService } from '../../../shared/observability/request-context.service';
import {
  AdminConsoleActivityLogsQueryDto,
  AdminConsoleActivityLogsResponseDto,
} from './dto/admin-console-activity-logs.dto';

@ApiTags('admin-console-activity-logs')
@ApiBearerAuth()
@Controller('admin/console/activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
export class AdminConsoleActivityLogsController {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List sanitized administrative activity events' })
  @ApiResponse({ status: 200, type: AdminConsoleActivityLogsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid activity-log query' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  list(
    @CurrentUser('id') actorUserId: string,
    @Query() query: AdminConsoleActivityLogsQueryDto,
  ) {
    const requestId = this.requestContext.getRequestId();
    return this.audit.readForAdmin(query, {
      actorUserId,
      correlationId: requestId === 'background' ? undefined : requestId,
    });
  }
}

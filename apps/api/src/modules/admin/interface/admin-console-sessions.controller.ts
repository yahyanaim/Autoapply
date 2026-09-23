import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AdminSessionsService } from '../application/admin-sessions.service';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import {
  AdminConsoleSessionsQueryDto,
  AdminConsoleSessionsResponseDto,
} from './dto/admin-console-sessions-query.dto';

@ApiTags('admin-console-sessions')
@ApiBearerAuth()
@Controller('admin/console/sessions')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
export class AdminConsoleSessionsController {
  constructor(private readonly sessions: AdminSessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List sanitized sessions across the platform' })
  @ApiResponse({ status: 200, type: AdminConsoleSessionsResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  list(
    @CurrentUser('sessionId') currentSessionId: string | undefined,
    @Query() query: AdminConsoleSessionsQueryDto,
  ) {
    return this.sessions.list({ currentSessionId, ...query });
  }
}

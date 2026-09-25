import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminMetricsService } from '../application/admin-metrics.service';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import {
  AdminConsoleMetricsQueryDto,
  AdminConsoleMetricsResponseDto,
} from './dto/admin-console-metrics.dto';

@ApiTags('admin-console-metrics')
@ApiBearerAuth()
@Controller('admin/console/metrics')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
@ApiResponse({ status: 400, description: 'Invalid bounded UTC metrics range' })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Admin Console access denied' })
export class AdminConsoleMetricsController {
  constructor(private readonly metrics: AdminMetricsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Get aggregate-only current and historical billing plus estimated AI metrics',
  })
  @ApiResponse({ status: 200, type: AdminConsoleMetricsResponseDto })
  getMetrics(@Query() query: AdminConsoleMetricsQueryDto) {
    return this.metrics.getMetrics(query);
  }
}

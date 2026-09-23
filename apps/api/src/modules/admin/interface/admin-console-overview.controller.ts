import { Controller, Get, UseGuards } from '@nestjs/common';
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
import { AdminOverviewService } from '../application/admin-overview.service';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminConsoleOverviewResponseDto } from './dto/admin-console-overview.dto';

@ApiTags('admin-console-overview')
@ApiBearerAuth()
@Controller('admin/console/overview')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
export class AdminConsoleOverviewController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get()
  @ApiOperation({ summary: 'Get aggregate-only Admin Console overview' })
  @ApiResponse({ status: 200, type: AdminConsoleOverviewResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  getOverview() {
    return this.overview.getOverview();
  }
}

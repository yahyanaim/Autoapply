import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminBillingCompletenessService } from '../application/admin-billing-completeness.service';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import {
  AdminConsoleBillingCompletenessQueryDto,
  AdminConsoleBillingCompletenessResponseDto,
} from './dto/admin-console-billing-completeness.dto';

@ApiTags('admin-console-billing-completeness')
@ApiBearerAuth()
@Controller('admin/console/billing-completeness')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
export class AdminConsoleBillingCompletenessController {
  constructor(private readonly completeness: AdminBillingCompletenessService) {}

  @Get()
  @ApiOperation({ summary: 'Scan or page a bounded, read-only Stripe financial event comparison' })
  @ApiResponse({ status: 200, type: AdminConsoleBillingCompletenessResponseDto })
  get(@Query() query: AdminConsoleBillingCompletenessQueryDto) {
    return this.completeness.get(query);
  }
}

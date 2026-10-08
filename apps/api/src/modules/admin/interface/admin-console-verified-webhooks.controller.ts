import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminVerifiedWebhooksService } from '../application/admin-verified-webhooks.service';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminConsoleVerifiedWebhooksQueryDto,
  AdminConsoleVerifiedWebhooksResponseDto } from './dto/admin-console-verified-webhooks.dto';

@ApiTags('admin-console-verified-webhooks')
@ApiBearerAuth()
@Controller('admin/console/verified-webhooks')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
export class AdminConsoleVerifiedWebhooksController {
  constructor(private readonly verified: AdminVerifiedWebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'Read captured signature-verified Stripe webhook processing issues' })
  @ApiResponse({ status: 200, type: AdminConsoleVerifiedWebhooksResponseDto })
  list(@Query() query: AdminConsoleVerifiedWebhooksQueryDto) {
    return this.verified.list(query);
  }
}

import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { AdminVerifiedWebhooksService } from '../application/admin-verified-webhooks.service';
import { AdminWebhookRetryService } from '../application/admin-webhook-retry.service';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import { AdminConsoleVerifiedWebhooksQueryDto,
  AdminConsoleVerifiedWebhooksResponseDto, AdminConsoleVerifiedWebhookRetryParamDto,
  AdminConsoleVerifiedWebhookRetryBodyDto, AdminConsoleVerifiedWebhookRetryResponseDto,
} from './dto/admin-console-verified-webhooks.dto';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { RequestContextService } from '../../../shared/observability/request-context.service';
import { requireIdempotencyKey } from '../../../shared/idempotency/idempotency-key';

@ApiTags('admin-console-verified-webhooks')
@ApiBearerAuth()
@Controller('admin/console/verified-webhooks')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
export class AdminConsoleVerifiedWebhooksController {
  constructor(private readonly verified: AdminVerifiedWebhooksService,
    private readonly retries: AdminWebhookRetryService,
    private readonly requestContext: RequestContextService) {}

  @Get()
  @ApiOperation({ summary: 'Read captured signature-verified Stripe webhook processing issues' })
  @ApiResponse({ status: 200, type: AdminConsoleVerifiedWebhooksResponseDto })
  list(@Query() query: AdminConsoleVerifiedWebhooksQueryDto) {
    return this.verified.list(query);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request one Billing-owned retry of an eligible verified delivery' })
  @ApiParam({ name: 'id', description: 'Opaque local verified-delivery CUID' })
  @ApiHeader({ name: 'X-Admin-Step-Up-Proof', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: AdminConsoleVerifiedWebhookRetryBodyDto })
  @ApiResponse({ status: 200, type: AdminConsoleVerifiedWebhookRetryResponseDto })
  @ApiResponse({ status: 409, description: 'Delivery is not retryable' })
  async requestRetry(
    @Param() params: AdminConsoleVerifiedWebhookRetryParamDto,
    @Body() _body: AdminConsoleVerifiedWebhookRetryBodyDto,
    @Headers('x-admin-step-up-proof') stepUpProof: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('sessionId') sessionId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('mfaVerified') mfaVerified: boolean,
  ) {
    if (!stepUpProof) throw new BadRequestException('Step-up proof is required');
    const result = await this.retries.request({
      context: { actorUserId, sessionId, role, mfaVerified,
        correlationId: this.requestContext.getRequestId() },
      deliveryId: params.id,
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
      stepUpProof,
    });
    return { deliveryId: result.deliveryId, status: result.status,
      requestedAt: result.requestedAt.toISOString() };
  }
}

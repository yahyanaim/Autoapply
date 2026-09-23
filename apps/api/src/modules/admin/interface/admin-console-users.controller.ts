import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Get,
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
import { AdminUsersService } from '../application/admin-users.service';
import { AdminSessionsService } from '../application/admin-sessions.service';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import {
  AdminConsoleUserResponseDto,
  AdminConsoleUsersQueryDto,
  AdminConsoleUsersResponseDto,
  AdminConsoleUserSessionsQueryDto,
  AdminConsoleUserSessionsResponseDto,
} from './dto/admin-console-users-query.dto';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import {
  AdminConsoleUsageLimitsResponseDto,
  AdminConsoleUserIdParamDto,
} from './dto/admin-console-usage-limits.dto';
import {
  AdminConsoleSuspendUserDto,
  AdminConsoleSuspendUserResponseDto,
} from './dto/admin-console-suspend-user.dto';
import {
  AdminConsoleReactivateUserDto,
  AdminConsoleReactivateUserResponseDto,
} from './dto/admin-console-reactivate-user.dto';
import {
  AdminConsoleRevokeSessionDto,
  AdminConsoleRevokeSessionParamsDto,
  AdminConsoleRevokeSessionResponseDto,
  AdminConsoleRevokeAllSessionsDto,
  AdminConsoleRevokeAllSessionsResponseDto,
} from './dto/admin-console-revoke-session.dto';
import { RequestContextService } from '../../../shared/observability/request-context.service';

@ApiTags('admin-console-users')
@ApiBearerAuth()
@Controller('admin/console/users')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
export class AdminConsoleUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly adminSessions: AdminSessionsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List sanitized Admin Console users' })
  @ApiResponse({ status: 200, type: AdminConsoleUsersResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  list(@Query() query: AdminConsoleUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get sanitized Admin Console user detail' })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, type: AdminConsoleUserResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  @ApiResponse({ status: 404, description: 'User not found' })
  detail(@Param() params: AdminConsoleUserIdParamDto) {
    return this.users.detail(params.userId);
  }

  @Post(':userId/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend one user with a bound step-up proof' })
  @ApiParam({
    name: 'userId',
    type: String,
    description: 'Prisma CUID user identifier',
  })
  @ApiHeader({
    name: 'X-Admin-Step-Up-Proof',
    required: true,
    description: 'Single-use proof bound to this actor, session, action, and user',
  })
  @ApiBody({ type: AdminConsoleSuspendUserDto })
  @ApiResponse({ status: 200, type: AdminConsoleSuspendUserResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid suspension request or proof' })
  @ApiResponse({ status: 401, description: 'Step-up proof is invalid' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'User cannot be suspended in its current state' })
  async suspend(
    @Param() params: AdminConsoleUserIdParamDto,
    @Headers('x-admin-step-up-proof') stepUpProof: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('sessionId') sessionId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('mfaVerified') mfaVerified: boolean,
    @Body() input: AdminConsoleSuspendUserDto,
  ) {
    const mutation = await this.users.suspend({
      context: {
        actorUserId,
        sessionId,
        role,
        mfaVerified,
        correlationId: this.requestContext.getRequestId(),
      },
      targetUserId: params.userId,
      reason: input.reason,
      stepUpProof: stepUpProof ?? '',
    });
    return {
      userId: mutation.userId,
      status: mutation.status,
      suspendedAt: mutation.suspendedAt.toISOString(),
    };
  }

  @Post(':userId/reactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reactivate one suspended user with a bound step-up proof' })
  @ApiParam({
    name: 'userId',
    type: String,
    description: 'Prisma CUID user identifier',
  })
  @ApiHeader({
    name: 'X-Admin-Step-Up-Proof',
    required: true,
    description: 'Single-use proof bound to this actor, session, action, and user',
  })
  @ApiBody({ type: AdminConsoleReactivateUserDto })
  @ApiResponse({ status: 200, type: AdminConsoleReactivateUserResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid reactivation request or proof' })
  @ApiResponse({ status: 401, description: 'Step-up proof is invalid' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'User is not suspended' })
  async reactivate(
    @Param() params: AdminConsoleUserIdParamDto,
    @Headers('x-admin-step-up-proof') stepUpProof: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('sessionId') sessionId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('mfaVerified') mfaVerified: boolean,
    @Body() _input: AdminConsoleReactivateUserDto,
  ) {
    const mutation = await this.users.reactivateUser({
      context: {
        actorUserId,
        sessionId,
        role,
        mfaVerified,
        correlationId: this.requestContext.getRequestId(),
      },
      targetUserId: params.userId,
      stepUpProof: stepUpProof ?? '',
    });
    return {
      userId: mutation.userId,
      status: mutation.status,
    };
  }

  @Post(':userId/sessions/:sessionId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke one user session with a bound step-up proof' })
  @ApiParam({ name: 'userId', type: String, description: 'Prisma CUID user identifier' })
  @ApiParam({ name: 'sessionId', type: String, description: 'UUID v4 session identifier' })
  @ApiHeader({
    name: 'X-Admin-Step-Up-Proof',
    required: true,
    description: 'Single-use proof bound to this actor, session, action, and target session',
  })
  @ApiBody({ type: AdminConsoleRevokeSessionDto })
  @ApiResponse({ status: 200, type: AdminConsoleRevokeSessionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid revocation request or proof' })
  @ApiResponse({ status: 401, description: 'Step-up proof is invalid' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeSession(
    @Param() params: AdminConsoleRevokeSessionParamsDto,
    @Headers('x-admin-step-up-proof') stepUpProof: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('sessionId') sessionId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('mfaVerified') mfaVerified: boolean,
    @Body() _input: AdminConsoleRevokeSessionDto,
  ) {
    return this.adminSessions.revoke({
      context: {
        actorUserId,
        sessionId,
        role,
        mfaVerified,
        correlationId: this.requestContext.getRequestId(),
      },
      targetUserId: params.userId,
      targetSessionId: params.sessionId,
      stepUpProof: stepUpProof ?? '',
    });
  }

  @Post(':userId/sessions/revoke-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke all user sessions except the current administrator session' })
  @ApiParam({ name: 'userId', type: String, description: 'Prisma CUID user identifier' })
  @ApiHeader({
    name: 'X-Admin-Step-Up-Proof',
    required: true,
    description: 'Single-use proof bound to this actor, session, action, and target user',
  })
  @ApiBody({ type: AdminConsoleRevokeAllSessionsDto })
  @ApiResponse({ status: 200, type: AdminConsoleRevokeAllSessionsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid revocation request or proof' })
  @ApiResponse({ status: 401, description: 'Step-up proof is invalid' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async revokeAllSessions(
    @Param() params: AdminConsoleUserIdParamDto,
    @Headers('x-admin-step-up-proof') stepUpProof: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('sessionId') sessionId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('mfaVerified') mfaVerified: boolean,
    @Body() _input: AdminConsoleRevokeAllSessionsDto,
  ) {
    return this.adminSessions.revokeAll({
      context: {
        actorUserId,
        sessionId,
        role,
        mfaVerified,
        correlationId: this.requestContext.getRequestId(),
      },
      targetUserId: params.userId,
      stepUpProof: stepUpProof ?? '',
    });
  }

  @Get(':userId/usage-limits')
  @ApiOperation({ summary: 'Get sanitized Billing usage limits for one user' })
  @ApiParam({
    name: 'userId',
    type: String,
    description: 'Prisma CUID user identifier',
  })
  @ApiResponse({ status: 200, type: AdminConsoleUsageLimitsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid user identifier' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  @ApiResponse({ status: 404, description: 'User or usage entitlement not found' })
  usageLimits(@Param() params: AdminConsoleUserIdParamDto) {
    return this.users.usageLimits(params.userId);
  }

  @Get(':userId/sessions')
  @ApiOperation({ summary: 'List sanitized sessions for one Admin Console user' })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, type: AdminConsoleUserSessionsResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  @ApiResponse({ status: 404, description: 'User not found' })
  sessions(
    @Param() params: AdminConsoleUserIdParamDto,
    @CurrentUser('sessionId') currentSessionId: string | undefined,
    @Query() query: AdminConsoleUserSessionsQueryDto,
  ) {
    return this.users.sessions({
      targetUserId: params.userId,
      currentSessionId,
      ...query,
    });
  }
}

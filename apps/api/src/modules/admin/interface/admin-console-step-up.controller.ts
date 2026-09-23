import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AdminStepUpMfaService } from '../application/admin-step-up-mfa.service';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { AdminConsoleEnabledGuard } from './guards/admin-console-enabled.guard';
import {
  AdminConsoleStepUpActionDto,
  AdminConsoleStepUpRequestDto,
  AdminConsoleStepUpResponseDto,
} from './dto/admin-console-step-up.dto';

@ApiTags('admin-console-step-up')
@ApiBearerAuth()
@Controller('admin/console/step-up')
@UseGuards(JwtAuthGuard, RolesGuard, AdminConsoleEnabledGuard)
@Roles(UserRole.platform_admin)
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
export class AdminConsoleStepUpController {
  constructor(private readonly stepUpMfa: AdminStepUpMfaService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a bound single-use Admin Console step-up proof' })
  @ApiBody({ type: AdminConsoleStepUpRequestDto })
  @ApiResponse({ status: 200, type: AdminConsoleStepUpResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid step-up request' })
  @ApiResponse({ status: 401, description: 'Step-up verification failed' })
  @ApiResponse({ status: 403, description: 'Admin Console access denied' })
  async issue(
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('sessionId') sessionId: string,
    @Body() input: AdminConsoleStepUpRequestDto,
  ) {
    const sessionAction = input.action === AdminConsoleStepUpActionDto.revokeSession;
    if (
      (sessionAction && input.targetType !== 'session') ||
      (!sessionAction && input.targetType !== 'user')
    ) {
      throw new BadRequestException('Invalid step-up target binding');
    }
    const issued = await this.stepUpMfa.issue(
      {
        actorUserId,
        sessionId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
      },
      input.code,
    );
    return {
      proof: issued.proof,
      expiresAt: issued.expiresAt.toISOString(),
    };
  }
}

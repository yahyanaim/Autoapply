import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  Headers,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AIService } from '../application/ai.service';
import { MatchScoreDto } from './dto/match-score.dto';
import { OptimizeDto } from './dto/optimize.dto';
import { CoverLetterDto } from './dto/cover-letter.dto';
import { MatchScoreTextDto } from './dto/match-score-text.dto';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';
import { SubscriptionPlan } from '@prisma/client';
import { RequiresPlan } from '../../billing/interface/plan-entitlement.decorator';
import { PlanEntitlementGuard } from '../../billing/interface/guards/plan-entitlement.guard';
import { Throttle } from '@nestjs/throttler';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { requireIdempotencyKey } from '../../../shared/idempotency/idempotency-key';

@ApiTags('ai')
@Controller('ai')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly idempotency: IdempotencyService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  @Post('match-score')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Calculate resume-job match score' })
  @ApiResponse({ status: 200, description: 'Match score calculated' })
  @ApiResponse({ status: 404, description: 'Resume or job not found' })
  async matchScore(
    @CurrentUser('id') userId: string,
    @Body() dto: MatchScoreDto,
  ) {
    return this.aiService.matchScore(userId, dto.resumeId, dto.jobId);
  }

  @Post('match-score-text')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Calculate a match score against supplied job text',
  })
  async matchScoreText(
    @CurrentUser('id') userId: string,
    @Body() dto: MatchScoreTextDto,
  ) {
    return this.aiService.matchScoreText(
      userId,
      dto.resumeId,
      dto.jobDescription,
    );
  }

  @Post('optimize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Optimize resume for a specific job' })
  @ApiResponse({ status: 200, description: 'Resume optimized' })
  @ApiResponse({ status: 403, description: 'Usage limit exceeded' })
  async optimize(
    @CurrentUser('id') userId: string,
    @Body() dto: OptimizeDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute({
      userId,
      key: requireIdempotencyKey(idempotencyKey),
      operation: 'ai.optimize',
      payload: dto,
      handler: () =>
        this.aiService.optimizeResume(userId, dto.resumeId, dto.jobId),
    });
  }

  @Post('cover-letter')
  @UseGuards(JwtAuthGuard, PlanEntitlementGuard)
  @RequiresPlan(SubscriptionPlan.pro, 'Cover-letter generation')
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Generate a cover letter' })
  @ApiResponse({ status: 200, description: 'Cover letter generated' })
  async coverLetter(
    @CurrentUser('id') userId: string,
    @Body() dto: CoverLetterDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute({
      userId,
      key: requireIdempotencyKey(idempotencyKey),
      operation: 'ai.cover-letter',
      payload: dto,
      handler: () =>
        this.aiService.generateCoverLetter(
          userId,
          dto.jobId,
          dto.resumeId,
          dto.tone,
        ),
    });
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI usage cost summary' })
  @ApiResponse({ status: 200, description: 'Usage summary retrieved' })
  async getUsage(
    @CurrentUser('id') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(this.clock.nowMs() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : this.clock.now();

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      throw new BadRequestException('Invalid date format');
    }

    return this.aiService.getCostSummary(userId, start, end);
  }
}

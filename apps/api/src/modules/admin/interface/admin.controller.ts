import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Optional,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/interface/guards/roles.guard';
import { Roles } from '../../auth/interface/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AdminService } from '../application/admin.service';
import { AdminMetricsDto } from './dto/admin-metrics.dto';
import { IngestJobsDto } from './dto/ingest-jobs.dto';
import { JobIngestionService } from '../../job/application/job-ingestion.service';
import { Throttle } from '@nestjs/throttler';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.platform_admin)
@ApiBearerAuth()
@Throttle({ default: { limit: 50, ttl: 15 * 60_000 } })
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly jobIngestionService: JobIngestionService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  @Post('jobs/ingest')
  @ApiOperation({ summary: 'Ingest jobs from an approved public ATS API' })
  async ingestJobs(@Body() dto: IngestJobsDto) {
    return this.jobIngestionService.ingest(dto.source, dto.identifier);
  }

  @Get('users')
  @ApiOperation({ summary: 'List all users (admin)' })
  @ApiResponse({ status: 200, description: 'Users retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      search,
    );
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get platform metrics (admin)' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  async getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('ai-usage')
  @ApiOperation({ summary: 'Get AI usage analytics (admin)' })
  @ApiResponse({ status: 200, description: 'AI usage retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getAIUsage(@Query() query: AdminMetricsDto) {
    const start = query.startDate
      ? new Date(query.startDate)
      : new Date(this.clock.nowMs() - 30 * 24 * 60 * 60 * 1000);
    const end = query.endDate ? new Date(query.endDate) : this.clock.now();
    return this.adminService.getAIUsage(start, end);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Get user detail (admin)' })
  @ApiResponse({ status: 200, description: 'User detail retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserDetail(@Param('userId') userId: string) {
    return this.adminService.getUserDetail(userId);
  }
}

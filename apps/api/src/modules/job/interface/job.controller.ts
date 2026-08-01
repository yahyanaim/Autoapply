import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { JobService } from '../application/job.service';
import { JobSearchDto } from './dto/job-search.dto';
import { RemoteType } from '@prisma/client';
import { CaptureJobDto } from './dto/capture-job.dto';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { DiscoverJobsDto } from './dto/discover-jobs.dto';
import { JobDiscoveryService } from '../application/job-discovery.service';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { requireIdempotencyKey } from '../../../shared/idempotency/idempotency-key';

@ApiTags('jobs')
@Controller('jobs')
export class JobController {
  constructor(
    private readonly jobService: JobService,
    private readonly jobDiscoveryService: JobDiscoveryService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search jobs with filters' })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  @ApiQuery({ name: 'query', required: false })
  @ApiQuery({ name: 'location', required: false })
  @ApiQuery({ name: 'remoteType', required: false, enum: RemoteType })
  @ApiQuery({ name: 'salaryMin', required: false, type: Number })
  @ApiQuery({ name: 'salaryMax', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async search(
    @CurrentUser('id') userId: string,
    @Query() query: JobSearchDto,
  ) {
    const filters = {
      query: query.query,
      location: query.location,
      remoteType: query.remoteType as RemoteType | undefined,
      salaryMin: query.salaryMin ? Number(query.salaryMin) : undefined,
      salaryMax: query.salaryMax ? Number(query.salaryMax) : undefined,
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 20,
    };
    return this.jobService.search(filters, userId);
  }

  @Post('capture')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Capture a job opened by the authenticated user' })
  @ApiResponse({ status: 201, description: 'Job captured and normalized' })
  async capture(@CurrentUser('id') userId: string, @Body() dto: CaptureJobDto) {
    const hostname = new URL(dto.sourceUrl).hostname.replace(/^www\./, '');
    return this.jobService.ingestJob({
      title: dto.title,
      description: dto.description,
      sourceUrl: dto.sourceUrl,
      location: dto.location,
      companyName: dto.companyName,
      source: dto.source?.trim() || hostname,
      capturedByUserId: userId,
    });
  }

  @Post('discover')
  @Throttle({ default: { limit: 12, ttl: 60 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({
    summary: 'Refresh approved sources and rank up to 20 jobs against a resume',
  })
  @ApiResponse({
    status: 201,
    description: 'Explainable CV-matched job recommendations',
  })
  async discover(
    @CurrentUser('id') userId: string,
    @Body() dto: DiscoverJobsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute({
      userId,
      key: requireIdempotencyKey(idempotencyKey),
      operation: 'jobs.discover',
      payload: dto,
      handler: () => this.jobDiscoveryService.discover(userId, dto),
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, description: 'Job retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJob(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.jobService.getJob(id, userId);
  }
}

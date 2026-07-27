import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
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
import { JobService } from '../application/job.service';
import { JobSearchDto } from './dto/job-search.dto';
import { RemoteType } from '@prisma/client';
import { CaptureJobDto } from './dto/capture-job.dto';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';

@ApiTags('jobs')
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

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
  async capture(
    @CurrentUser('id') userId: string,
    @Body() dto: CaptureJobDto,
  ) {
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

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, description: 'Job retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJob(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.jobService.getJob(id, userId);
  }
}

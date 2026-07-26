import {
  Controller,
  Get,
  Param,
  Query,
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
  async search(@Query() query: JobSearchDto) {
    const filters = {
      query: query.query,
      location: query.location,
      remoteType: query.remoteType as RemoteType | undefined,
      salaryMin: query.salaryMin ? Number(query.salaryMin) : undefined,
      salaryMax: query.salaryMax ? Number(query.salaryMax) : undefined,
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 20,
    };
    return this.jobService.search(filters);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, description: 'Job retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJob(@Param('id') id: string) {
    return this.jobService.getJob(id);
  }
}

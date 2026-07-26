import {
  Controller,
  Delete,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { ApplicationTrackerService } from '../application/application-tracker.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';

@ApiTags('applications')
@Controller('applications')
export class ApplicationTrackerController {
  constructor(private readonly trackerService: ApplicationTrackerService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new application' })
  @ApiResponse({ status: 201, description: 'Application created' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.trackerService.create(
      userId,
      dto.jobId,
      dto.resumeVersionId,
      dto.coverLetterId,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List user applications' })
  @ApiResponse({ status: 200, description: 'Applications retrieved' })
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: ListApplicationsDto,
  ) {
    return this.trackerService.list(userId, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get an application' })
  @ApiResponse({ status: 200, description: 'Application retrieved' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async get(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.trackerService.get(userId, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update application status' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async updateStatus(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.trackerService.updateStatus(userId, id, dto.status);
  }

  @Get(':id/timeline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get application timeline' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async getTimeline(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.trackerService.getTimeline(userId, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a tracked application' })
  @ApiResponse({ status: 200, description: 'Application deleted' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.trackerService.delete(userId, id);
  }
}
